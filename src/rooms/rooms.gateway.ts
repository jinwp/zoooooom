import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

interface SDPMessage {
  roomId: string;
  description: RTCSessionDescriptionInit;
}
interface ICEMessage {
  roomId: string;
  candidate: RTCIceCandidateInit;
}

@WebSocketGateway({
  cors: { origin: '*' }, // allow VS Code live‑server origin
  namespace: '/signal', // <‑‑ optional namespace
})
export class RoomsGateway {
  @WebSocketServer() server: Server;

  @SubscribeMessage('join')
  handleJoin(@ConnectedSocket() client: Socket, @MessageBody() roomId: string) {
    client.join(roomId);
    client.to(roomId).emit('peer:joined', client.id);
    console.log(`${client.id} joined ${roomId}`);
  }

  @SubscribeMessage('offer')
  handleOffer(
    @ConnectedSocket() client: Socket,
    @MessageBody() msg: SDPMessage,
  ) {
    client.to(msg.roomId).emit('offer', msg.description);
  }

  @SubscribeMessage('answer')
  handleAnswer(
    @ConnectedSocket() client: Socket,
    @MessageBody() msg: SDPMessage,
  ) {
    client.to(msg.roomId).emit('answer', msg.description);
  }

  @SubscribeMessage('ice')
  handleIce(@ConnectedSocket() client: Socket, @MessageBody() msg: ICEMessage) {
    client.to(msg.roomId).emit('ice', msg.candidate);
  }
}
