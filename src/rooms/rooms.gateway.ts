import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { JwtService } from '@nestjs/jwt';
import { Server, Socket } from 'socket.io';
import { RoomsService } from './rooms.service';
import { Room } from '@prisma/client';

interface SDPMessage { roomId: string; description: RTCSessionDescriptionInit; }
interface ICEMessage { roomId: string; candidate: RTCIceCandidateInit; }
interface JoinPayload { roomIdOrCode: string; password?: string; }
interface JwtPayload { id: string; email: string; name: string; iat?: number; exp?: number; }

interface AuthSocket extends Socket {
  user?: { id: string; email: string; name: string };
}

@WebSocketGateway({
  namespace: '/signal',
  cors: { origin: '*' },
})
export class RoomsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;

  constructor(
    private readonly jwt: JwtService,
    private readonly rooms: RoomsService,
  ) {}

  // ✅ put helper INSIDE class (TS1131 gone)
  private assertAuthed(socket: AuthSocket): asserts socket is AuthSocket & {
    user: { id: string; email: string; name: string };
  } {
    if (!socket.user) throw new Error('Unauthenticated socket');
  }

  async handleConnection(client: AuthSocket) {
    try {
      const token =
        client.handshake.auth?.token ||
        client.handshake.headers.authorization?.toString()?.split(' ')[1];
      if (!token) throw new Error('No token');

      const payload = this.jwt.verify<JwtPayload>(token);   // ✅ generic -> no {}
      client.user = { id: payload.id, email: payload.email, name: payload.name };

      client.emit('rtc_config', {
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
      });
    } catch {
      client.disconnect();
    }
  }

  handleDisconnect(client: AuthSocket) {
    client.rooms.forEach(roomId =>
      client.to(roomId).emit('peer:left', { userId: client.user?.id }),
    );
  }

  @SubscribeMessage('join')
  async join(@ConnectedSocket() client: AuthSocket, @MessageBody() body: JoinPayload) {
    this.assertAuthed(client);  // ✅ narrows client.user

    const room = await this.rooms.findByIdentifier(body.roomIdOrCode);
    if (!room || !room.isActive) return client.emit('join:error', 'NOT_FOUND');

    const ok = await this.rooms.verifyPassword(room, body.password ?? '');
    if (!ok) return client.emit('join:error', 'WRONG_PASSWORD');

    const occ = this.server.sockets.adapter.rooms.get(room.id)?.size ?? 0;
    if (occ >= 2) return client.emit('join:error', 'ROOM_FULL');

    client.join(room.id);
    client.emit('join:success', this.rooms.strip(room)); // ✅
    client.to(room.id).emit('peer:joined', { userId: client.user.id }); // ✅ after assertAuthed
  }

  @SubscribeMessage('leave')
  leave(@ConnectedSocket() client: AuthSocket, @MessageBody() { roomId }: { roomId: string }) {
    this.assertAuthed(client);
    client.leave(roomId);
    client.to(roomId).emit('peer:left', { userId: client.user.id });
  }

  @SubscribeMessage('offer')
  offer(@ConnectedSocket() c: AuthSocket, @MessageBody() msg: SDPMessage) {
    c.to(msg.roomId).emit('offer', msg.description);
  }

  @SubscribeMessage('answer')
  answer(@ConnectedSocket() c: AuthSocket, @MessageBody() msg: SDPMessage) {
    c.to(msg.roomId).emit('answer', msg.description);
  }

  @SubscribeMessage('ice')
  ice(@ConnectedSocket() c: AuthSocket, @MessageBody() msg: ICEMessage) {
    c.to(msg.roomId).emit('ice', msg.candidate);
  }
}
