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

  const handleEditorDidMount = (editor: any) => {
    editorRef.current = editor;

    const doc = new Y.Doc();
    const type = doc.getText('monaco');
    
    new MonacoBinding(type, editor.getModel(), new Set([editor]));

    const ws = new WebSocket(`ws://localhost:8000/room/${id}`);
    wsRef.current = ws;

    // INCOMING: Safely decode the stringified text back into a raw binary buffer
    ws.onmessage = async (event) => {
      try {
        let textData;
        
        // Handle whatever format the browser hands us (Blob, String, or ArrayBuffer)
        if (event.data instanceof Blob) {
          textData = await event.data.text();
        } else if (typeof event.data === 'string') {
          textData = event.data;
        } else {
          const decoder = new TextDecoder('utf-8');
          textData = decoder.decode(event.data);
        }

        // Parse the JSON array and feed the exact bytes back into Yjs
        const updateArray = JSON.parse(textData);
        const buffer = new Uint8Array(updateArray);
        Y.applyUpdate(doc, buffer, 'network');
      } catch (error) {
        console.error('Error applying Yjs update:', error);
      }
    };

    // OUTGOING: Serialize the full document state to a JSON array to bypass binary corruption
    doc.on('update', (update, origin) => {
      if (origin !== 'network' && ws.readyState === WebSocket.OPEN) {
        // Send the FULL state to guarantee no missing history errors for late joiners
        const fullState = Y.encodeStateAsUpdate(doc);
        const updateArray = Array.from(fullState);
        ws.send(JSON.stringify(updateArray));
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