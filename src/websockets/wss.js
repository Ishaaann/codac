import { WebSocketServer } from 'ws';
// import { url } from 'url';
import { parse } from 'url';
import { URL } from 'url';

export const localRooms = new Map(); 

function setUpWebSocketServer(server) {
    const wss = new WebSocketServer({ noServer: true });

    server.on('upgrade', (request, socket, head) => {
        try{
            const baseUrl = `http://${request.headers.host}`;
            const url = new URL(request.url, baseUrl);
            const pathname = url.pathname;
            const roomMatch = pathname.match(/^\/room\/([^/]+)$/);
            if(!roomMatch) 
            {
                socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
                socket.destroy();
                return;
            } 
            const roomId = roomMatch[1];
            wss.handleUpgrade(request, socket, head, (ws) => {
                ws.roomId = roomId;
                wss.emit('connection', ws, request);
            });
        }
        catch (error) {
            console.error('Error during WebSocket upgrade:', error);
            socket.write('HTTP/1.1 500 Internal Server Error\r\n\r\n');
            socket.destroy();
        }
    });
    
    wss.on('connection', (ws, request) => {
        const roomId = ws.roomId;
        if (!localRooms.has(roomId)) {
            localRooms.set(roomId, new Set());
        }
        localRooms.get(roomId).add(ws);
        ws.on('message', (message) => {
            console.log(`Received message from room ${roomId}: ${message}`);
            //to be implemented: broadcast the message to all clients in the same room
        });

        ws.on('close', () => {
        // const roomId = ws.roomId;
        const roomClients = localRooms.get(roomId);
        roomClients.delete(ws);
        if (roomClients.size === 0) {
            localRooms.delete(roomId);
            console.log(`Room ${roomId} deleted as it has no more clients.`);
        }
        });
    });

    
}

export { setUpWebSocketServer };