import { useRef, useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useParams } from 'react-router-dom';
import Editor from '@monaco-editor/react';
import * as Y from 'yjs';
import { MonacoBinding } from 'y-monaco';
import { v4 as uuidv4 } from 'uuid';

const CodeEditor = () => {
  const { id } = useParams<{ id: string }>();
  const editorRef = useRef<any>(null);
  const wsRef = useRef<WebSocket | null>(null);
  
  // New state to handle the live terminal output
  const [output, setOutput] = useState<string>('> Ready... Waiting for execution.');

  const handleEditorDidMount = (editor: any, monaco: any) => {
    editorRef.current = editor;
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
          ws.send(JSON.stringify({ type: 'full_sync', data: Array.from(state) }));
        } 
        else if (payload.type === 'full_sync' || payload.type === 'update') {
          const buffer = new Uint8Array(payload.data);
          Y.applyUpdate(doc, buffer, 'network');
        }
        // Handle incoming execution results from the backend
        else if (payload.type === 'execution_result') {
          setOutput(`> Output:\n${payload.data}`);
        }
      } catch (error) {
        console.error('Error handling WebSocket message:', error);
      }
    };

    doc.on('update', (update, origin) => {
      if (origin !== 'network' && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'update', data: Array.from(update) }));
      }
    });
  };

  useEffect(() => {
    return () => {
      if (wsRef.current) wsRef.current.close();
    };
  }, []);

  // Grabs the exact current text from Monaco and requests execution
  const executeCode = () => {
    if (wsRef.current && editorRef.current) {
      setOutput('> Compiling and running code remotely...');
      const currentCode = editorRef.current.getValue();
      wsRef.current.send(JSON.stringify({
        type: 'execute',
        data: currentCode
      }));
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', backgroundColor: '#1e1e1e' }}>
      
      {/* Top Header Bar */}
      <div style={{ padding: '10px 20px', backgroundColor: '#252526', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #333' }}>
        <h2 style={{ margin: 0, color: '#ccc', fontSize: '16px', fontFamily: 'monospace' }}>Codac / {id}</h2>
        <button 
          onClick={executeCode}
          style={{ backgroundColor: '#0e639c', color: 'white', border: 'none', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' }}
        >
          ▶ Run Code
        </button>
      </div>

      {/* Main Editor Pane (Takes up remaining space) */}
      <div style={{ flexGrow: 1, position: 'relative' }}>
        <Editor
          height="100%"
          theme="vs-dark"
          defaultLanguage="javascript"
          onMount={handleEditorDidMount}
          options={{ minimap: { enabled: false }, fontSize: 16, padding: { top: 16 } }}
        />
      </div>

      {/* Bottom Terminal Pane */}
      <div style={{ height: '250px', backgroundColor: '#1e1e1e', borderTop: '1px solid #333', padding: '10px' }}>
        <div style={{ color: '#858585', fontSize: '12px', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '1px' }}>Terminal Output</div>
        <pre style={{ margin: 0, color: '#4af626', fontFamily: 'monospace', fontSize: '14px', whiteSpace: 'pre-wrap', overflowY: 'auto', height: 'calc(100% - 25px)' }}>
          {output}
        </pre>
      </div>
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