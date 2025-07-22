// rooms.gateway.ts
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
import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import { RoomsService } from './rooms.service';

interface SDPMessage {
  roomId: string;
  description: RTCSessionDescriptionInit;
}
interface ICEMessage {
  roomId: string;
  candidate: RTCIceCandidateInit;
}
interface JoinPayload {
  roomIdOrCode: string;
  password?: string;
}

interface AuthSocket extends Socket {
  user?: { id: string; email: string; name: string };
}

@WebSocketGateway({
  namespace: '/signal',
  cors: { origin: '*' },
})
export class RoomsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() private server: Server;

  constructor(
    private readonly jwt: JwtService,
    private readonly rooms: RoomsService,
  ) {}

  /** Ensure the socket is authenticated and has a user */
  private assertAuthed(socket: AuthSocket): asserts socket is AuthSocket & {
    user: { id: string; email: string; name: string };
  } {
    if (!socket.user) throw new Error('Unauthenticated socket');
  }

  /** On initial connect: verify JWT, attach user, send STUN config */
  async handleConnection(client: AuthSocket) {
    try {
      const token =
        client.handshake.auth?.token ||
        client.handshake.headers.authorization
          ?.toString()
          .split(' ')[1];
      if (!token) throw new Error('No token');

      const payload = this.jwt.verify<{ id: string; email: string; name: string }>(
        token,
      );
      client.user = {
        id: payload.id,
        email: payload.email,
        name: payload.name,
      };

      client.emit('rtc_config', {
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
      });
    } catch {
      client.disconnect();
    }
  }

  /** On any disconnect: notify peers, and if owner, delete the room */
  async handleDisconnect(client: AuthSocket) {
    // For each room the socket was in (socket.io auto-includes client.id)
    for (const roomId of client.rooms) {
      if (roomId === client.id) continue;
      client.to(roomId).emit('peer:left', { userId: client.user?.id });

      // If the leaving user is the room owner, delete the room
      try {
        const room = await this.rooms.findById(roomId);
        if (room.ownerUserId === client.user?.id) {
          await this.rooms.delete(roomId);
          this.server.to(roomId).emit('room-deleted');
          this.server.socketsLeave(roomId);
        }
      } catch {
        /* ignore errors in cleanup */
      }
    }
  }

  /** Join a room by ID *or* meetingCode + optional password */
  @SubscribeMessage('join')
  async join(
    @ConnectedSocket() client: AuthSocket,
    @MessageBody() body: JoinPayload,
  ) {
    this.assertAuthed(client);

    try {
      // This uses your service.join(dto) → { id } :contentReference[oaicite:0]{index=0}
      const { id: roomId } = await this.rooms.join({
        meetingCode: body.roomIdOrCode,
        password: body.password,
      });

      // Enforce 2-peer max
      const occ = this.server.sockets.adapter.rooms.get(roomId)?.size ?? 0;
      if (occ >= 2) {
        return client.emit('join:error', 'ROOM_FULL');
      }

      client.join(roomId);
      client.emit('join:success', { roomId });
      client.to(roomId).emit('peer:joined', { userId: client.user.id });
    } catch (err) {
      if (err instanceof NotFoundException) {
        client.emit('join:error', 'NOT_FOUND');
      } else if (err instanceof UnauthorizedException) {
        client.emit('join:error', 'WRONG_PASSWORD');
      } else {
        client.emit('join:error', 'UNKNOWN_ERROR');
      }
    }
  }

  /** Explicit leave (peer clicked “leave”) */
  @SubscribeMessage('leave')
  leave(
    @ConnectedSocket() client: AuthSocket,
    @MessageBody() { roomId }: { roomId: string },
  ) {
    this.assertAuthed(client);
    client.leave(roomId);
    client.to(roomId).emit('peer:left', { userId: client.user.id });
  }

  /** WebRTC offer/answer/ice exchange */
  @SubscribeMessage('offer')
  offer(@ConnectedSocket() client: AuthSocket, @MessageBody() msg: SDPMessage) {
    client.to(msg.roomId).emit('offer', msg.description);
  }

  @SubscribeMessage('answer')
  answer(
    @ConnectedSocket() client: AuthSocket,
    @MessageBody() msg: SDPMessage,
  ) {
    client.to(msg.roomId).emit('answer', msg.description);
  }

  @SubscribeMessage('ice')
  ice(@ConnectedSocket() client: AuthSocket, @MessageBody() msg: ICEMessage) {
    client.to(msg.roomId).emit('ice', msg.candidate);
  }
}
