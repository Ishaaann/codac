import { useRef, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useParams } from 'react-router-dom';
import Editor from '@monaco-editor/react';
import * as Y from 'yjs';
import { MonacoBinding } from 'y-monaco';
import { v4 as uuidv4 } from 'uuid';

const CodeEditor = () => {
  const { id } = useParams<{ id: string }>();
  const editorRef = useRef<any>(null);
  const wsRef = useRef<WebSocket | null>(null);

  // We add 'monaco' as the second parameter to access the editor's core enums
  const handleEditorDidMount = (editor: any, monaco: any) => {
    editorRef.current = editor;

    // 🚨 THE FIX: Force standard Line Feeds (\n) to prevent CRDT Index Drift on Windows
    editor.getModel().setEOL(monaco.editor.EndOfLineSequence.LF);

    const doc = new Y.Doc();
    const type = doc.getText('monaco');
    
    new MonacoBinding(type, editor.getModel(), new Set([editor]));

    const ws = new WebSocket(`ws://localhost:8000/room/${id}`);
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'request_sync' }));
    };

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
      } catch (error) {
        console.error('Error applying Yjs update:', error);
      }
    };

    doc.on('update', (update, origin) => {
      if (origin !== 'network' && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'update',
          data: Array.from(update)
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