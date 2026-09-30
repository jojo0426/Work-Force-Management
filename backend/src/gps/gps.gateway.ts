import { WebSocketGateway, SubscribeMessage, WebSocketServer } from '@nestjs/websockets';
import { Server } from 'socket.io';

// Job Controller/Supervisor map shows:
// TECHNICIAN ● Current / Last Known Location
// ├── Online (green) ├── Working (amber) ├── Available (blue) └── Offline / Location Stale (gray + timestamp)

@WebSocketGateway({ cors: true })
export class GpsGateway {
  @WebSocketServer() server: Server;

  @SubscribeMessage('location:update')
  handleLocation(client: any, payload: { userId: string, lat: number, lng: number, status: string }) {
    // Save to location_logs
    // If no update >5min, mark is_stale=true, show last known + timestamp
    this.server.emit('technician:location', payload);
    return { received: true };
  }
}
