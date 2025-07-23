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
import { NotFoundException, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { RoomsService } from './rooms.service';

// === Types you actually use on the wire ===
type SDPDescription = { type: 'offer' | 'answer'; sdp: string };
type IceCandidate = { candidate: string; sdpMid?: string; sdpMLineIndex?: number };

interface JoinPayload {
  roomIdOrCode: string; // can be UUID or meetingCode
  password?: string;
}

interface SDPMessage {
  roomId: string;
  description: SDPDescription;
}

interface ICEMessage {
  roomId: string;
  candidate: IceCandidate;
}

interface AuthSocket extends Socket {
  user?: { id: string; email?: string; name?: string };
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

  // ---------------------- Utils ----------------------
  private assertAuthed(socket: AuthSocket): asserts socket is AuthSocket & { user: { id: string } } {
    if (!socket.user?.id) throw new UnauthorizedException('Unauthenticated socket');
  }

  // ---------------------- Lifecycle ----------------------
  // rooms.gateway.ts
  async handleConnection(client: AuthSocket) {
    try {
      const token =
        client.handshake.auth?.token ||
        client.handshake.query?.token ||
        client.handshake.headers.authorization?.split(' ')[1];
      if (!token) throw new Error('No token');

      const decoded: any = this.jwt.decode(token);
      console.log('[WS] payload', decoded);

      // ✨ use the same secret you used to sign your JWTs
      const payload = this.jwt.verify<any>(token, { secret: process.env.JWT_SECRET });

      const userId = payload.sub ?? payload.id;
      if (!userId) throw new Error('No userId in JWT');

      client.user = { id: userId, email: payload.email, name: payload.name };

      client.emit('rtc_config', { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
      console.log('[WS] authed', client.user.id);
    } catch (e: any) {
      console.error('[WS] auth fail', e.message);
      client.disconnect(true);
    }
  }

  async handleDisconnect(client: AuthSocket) {
    // notify each room
    for (const roomId of client.rooms) {
      if (roomId === client.id) continue;

      client.to(roomId).emit('peer:left', { userId: client.user?.id });

      // If owner disconnected, delete room
      try {
        const room = await this.rooms.findById(roomId);
        if (room && room.ownerUserId === client.user?.id) {
          await this.rooms.delete(roomId);
          this.server.to(roomId).emit('room-deleted');
          this.server.socketsLeave(roomId);
        }
      } catch {
        /* ignore cleanup errors */
      }
    }
  }

  // ---------------------- Room Join / Leave ----------------------
  @SubscribeMessage('join_room')
  async joinRoom(
    @ConnectedSocket() client: AuthSocket,
    @MessageBody() body: JoinPayload,
  ) {
    console.log('[WS] join_room from', client.id, body);
    this.assertAuthed(client);

    try {
      // Resolve & auth (adjust to your service API)
      const room = await this.rooms.join({
        meetingCode: body.roomIdOrCode,
        password: body.password,
      });
      const roomId = room.id;

      // Check capacity BEFORE actually joining
      const socketsBefore = await this.server.in(roomId).fetchSockets();
      if (socketsBefore.length >= 2) {
        client.emit('join:error', 'ROOM_FULL');
        return;
      }

      // Join the room
      client.join(roomId);
      client.emit('join:success', { roomId, ownerUserId: room.ownerUserId });

      const socketsInRoom = await this.server.in(roomId).fetchSockets();
      const roomSize = socketsInRoom.length;

      // Notify others
      client.to(roomId).emit('peer_joined', { userId: client.user.id });

      // Decide who makes the offer
      if (roomSize === 1) {
        client.emit('ready', { makeOffer: false });
      } else if (roomSize === 2) {
        const firstPeer = socketsInRoom.find((s) => s.id !== client.id)!;
        this.server.to(client.id).emit('ready', { makeOffer: true });     // newcomer makes offer
        this.server.to(firstPeer.id).emit('ready', { makeOffer: false }); // first peer waits
      } else {
        client.emit('join:error', 'ROOM_FULL');
        client.leave(roomId);
      }
    } catch (err) {
      console.error('[WS] join_room error', err);
      client.emit('join:error', 'JOIN_FAILED');
    }
  }

  @SubscribeMessage('leave')
  async leaveRoom(
    @ConnectedSocket() client: AuthSocket,
    @MessageBody() { roomId }: { roomId: string },
  ) {
    this.assertAuthed(client);
    client.leave(roomId);
    client.to(roomId).emit('peer:left', { userId: client.user.id });

    try {
      const room = await this.rooms.findById(roomId);
      if (room && room.ownerUserId === client.user.id) {
        await this.rooms.delete(roomId);
        this.server.to(roomId).emit('room-deleted');
        this.server.socketsLeave(roomId);
      }
    } catch {
      /* ignore */
    }
  }

  @SubscribeMessage('close_room')
  async closeRoom(
    @ConnectedSocket() client: AuthSocket,
    @MessageBody() { roomId }: { roomId: string },
  ) {
    this.assertAuthed(client);
    const room = await this.rooms.findById(roomId);
    if (!room) throw new NotFoundException('Room not found');
    if (room.ownerUserId !== client.user.id) throw new ForbiddenException();

    await this.rooms.delete(roomId);
    this.server.to(roomId).emit('room_closed');
    this.server.socketsLeave(roomId);
  }

  // ---------------------- WebRTC Signaling ----------------------
  @SubscribeMessage('offer')
  forwardOffer(
    @ConnectedSocket() client: AuthSocket,
    @MessageBody() msg: SDPMessage,
  ) {
    client.to(msg.roomId).emit('offer', { description: msg.description });
  }

  @SubscribeMessage('answer')
  forwardAnswer(
    @ConnectedSocket() client: AuthSocket,
    @MessageBody() msg: SDPMessage,
  ) {
    client.to(msg.roomId).emit('answer', { description: msg.description });
  }

  // rooms.gateway.ts
  @SubscribeMessage('ice_candidate')
  handleIce(
    @ConnectedSocket() client: AuthSocket,
    @MessageBody()
    { roomId, candidate }: { roomId: string; candidate: RTCIceCandidateInit },
  ) {
    client.to(roomId).emit('ice_candidate', { candidate });
  }

  // ---------------------- (Optional) Chat relay ----------------------
  @SubscribeMessage('chat_message')
  chatRelay(
    @ConnectedSocket() client: AuthSocket,
    @MessageBody() payload: { roomId: string; text: string; userId: string; ts: number },
  ) {
    client.to(payload.roomId).emit('chat_message', payload);
  }
}
