import http from 'http';
import express from 'express';
import { setUpWebSocketServer } from './websockets/wss.js';
import { connectToRedis } from './websockets/pubsub.js';

const app = express();
const port  = process.env.PORT || 8000;

app.use(express.json());

app.get('/health', (req, res) => {
    res.status(200).send({ status: 'OK' , message: 'Server is running' });
});

const server = http.createServer(app);

setUpWebSocketServer(server);

async function startServer(){
    try{
        await connectToRedis();
        server.listen(port, () => {
            console.log(`Server is running on port ${port}`);
        });
    } catch (error) {
        console.error('Error starting server:', error);
        process.exit(1);
    }
}

startServer();