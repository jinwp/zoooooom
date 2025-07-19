import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

// Simple message DTO
interface ChatMsg {
  roomId: string;
  text: string;
  sender: string; // display name or userId
  ts: number; // epoch ms
}

@WebSocketGateway({
  cors: { origin: '*' },
  namespace: '/chat',
})
export class ChatGateway {
  @WebSocketServer() server: Server;

  // 1) join a chat room (share roomId with signalling)
  @SubscribeMessage('chat:join')
  handleJoin(@ConnectedSocket() client: Socket, @MessageBody() roomId: string) {
    client.join(roomId);
    console.log(`${client.id} joined chat ${roomId}`);
  }

  // 2) broadcast chat text
  @SubscribeMessage('chat:message')
  handleMsg(@ConnectedSocket() client: Socket, @MessageBody() msg: ChatMsg) {
    // add timestamp server‑side if caller omitted it
    if (!msg.ts) msg.ts = Date.now();
    this.server.to(msg.roomId).emit('chat:msg', msg);
  }

  // 3) typing indicator (optional)
  @SubscribeMessage('chat:typing')
  handleTyping(@ConnectedSocket() client: Socket, @MessageBody() roomId: string) {
    client.to(roomId).emit('chat:typing', client.id);
  }
}
