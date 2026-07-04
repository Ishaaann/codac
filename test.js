import { WebSocket } from 'ws';

const ROOM_ID = 'interview-prep-room';

// Client A connects to Server 1 (Port 8000)
const clientA = new WebSocket(`ws://localhost:8000/room/${ROOM_ID}`);

// Client B connects to Server 2 (Port 8001)
const clientB = new WebSocket(`ws://localhost:8001/room/${ROOM_ID}`);

clientA.on('open', () => {
    console.log('Client A connected to Server 1');
    
    // Wait a brief second to ensure Client B has time to connect and subscribe to Redis
    setTimeout(() => {
        console.log('Client A sending message...');
        clientA.send('Hello from Client A! Did Redis route this?');
    }, 1000);
});

clientB.on('open', () => {
    console.log('Client B connected to Server 2');
});

// Listen for messages arriving at Client B
clientB.on('message', (data) => {
    console.log(`SUCCESS! Client B received: "${data.toString()}"\n`);
    
    // Clean up and exit the test
    clientA.close();
    clientB.close();
    process.exit(0);
});

// Error handling just in case
clientA.on('error', console.error);
clientB.on('error', console.error);