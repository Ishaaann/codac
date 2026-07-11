
import { useRef, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useParams } from 'react-router-dom';
import Editor from '@monaco-editor/react';
import * as Y from 'yjs';
import { MonacoBinding } from 'y-monaco';
import { Awareness, encodeAwarenessUpdate, applyAwarenessUpdate } from 'y-protocols/awareness';
import { v4 as uuidv4 } from 'uuid';

const CodeEditor = () => {
  const { id } = useParams<{ id: string }>();
  const editorRef = useRef<any>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const handleEditorDidMount = (editor: any, monaco: any) => {
    editorRef.current = editor;

    // Force standard Line Feeds to prevent Index Drift on Windows
    editor.getModel().setEOL(monaco.editor.EndOfLineSequence.LF);

    const doc = new Y.Doc();
    const type = doc.getText('monaco');
    
    // 1. Initialize the Awareness protocol
    const awareness = new Awareness(doc);

    // 2. Assign a random neon color and ID to the local user
    const cursorColors = ['#FF0055', '#00FF66', '#0099FF', '#FF9900', '#CC00FF', '#00FFFF'];
    const randomColor = cursorColors[Math.floor(Math.random() * cursorColors.length)];
    
    awareness.setLocalStateField('user', {
      name: `Dev-${Math.floor(Math.random() * 1000)}`,
      color: randomColor
    });

    // 3. Pass awareness to Monaco so it knows to draw the remote cursors
    new MonacoBinding(type, editor.getModel(), new Set([editor]), awareness);

    const ws = new WebSocket(`ws://localhost:8000/room/${id}`);
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'request_sync' }));
    };

    // INCOMING MESSAGES
    ws.onmessage = async (event) => {
      try {
        let textData = event.data instanceof Blob ? await event.data.text() :
                       typeof event.data === 'string' ? event.data :
                       new TextDecoder('utf-8').decode(event.data);

        const payload = JSON.parse(textData);

        if (payload.type === 'request_sync') {
          const state = Y.encodeStateAsUpdate(doc);
          ws.send(JSON.stringify({
            type: 'full_sync',
            data: Array.from(state)
          }));
        } 
        else if (payload.type === 'full_sync' || payload.type === 'update') {
          const buffer = new Uint8Array(payload.data);
          Y.applyUpdate(doc, buffer, 'network');
        }
        // 4. Handle incoming cursor movements
        else if (payload.type === 'awareness') {
          const buffer = new Uint8Array(payload.data);
          applyAwarenessUpdate(awareness, buffer, 'network');
        }
      } catch (error) {
        console.error('Error applying Yjs update:', error);
      }
    };

    // OUTGOING DOCUMENT MESSAGES (Keystrokes)
    doc.on('update', (update, origin) => {
      if (origin !== 'network' && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'update',
          data: Array.from(update)
        }));
      }
    });

    // 5. OUTGOING AWARENESS MESSAGES (Cursor movements)
    awareness.on('update', ({ added, updated, removed }, origin) => {
      if (origin !== 'network' && ws.readyState === WebSocket.OPEN) {
        const changedClients = added.concat(updated, removed);
        const awarenessUpdate = encodeAwarenessUpdate(awareness, changedClients);
        ws.send(JSON.stringify({
          type: 'awareness',
          data: Array.from(awarenessUpdate)
        }));
      }
    });
  };

  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  return (
    <div style={{ width: '100vw', height: '100vh', backgroundColor: '#1e1e1e' }}>
      {/* 6. A tiny bit of global CSS to make the nametags pop over the cursors */}
      <style>{`
        .yRemoteSelection { background-color: rgba(250, 129, 0, 0.2); }
        .yRemoteSelectionHead { position: absolute; border-left: 2px solid orange; border-top: 2px solid orange; bottom: 0px; height: 100%; box-sizing: border-box; }
        .yRemoteSelectionHead::after { position: absolute; content: ' '; border: 3px solid orange; border-radius: 4px; left: -4px; top: -5px; }
      `}</style>
      <Editor
        height="100vh"
        theme="vs-dark"
        defaultLanguage="javascript"
        onMount={handleEditorDidMount}
        options={{ minimap: { enabled: false }, fontSize: 16 }}
      />
    </div>
  );
};

const Home = () => {
  const roomId = uuidv4();
  return <Navigate to={`/room/${roomId}`} replace />;
};

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/room/:id" element={<CodeEditor />} />
      </Routes>
    </BrowserRouter>
  );
}