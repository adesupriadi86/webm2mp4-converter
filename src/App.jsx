import { useState, useRef, useEffect } from 'react';

// Pastikan index.html memuat script FFmpeg v0.10.1

function App() {
  const [statusTitle, setStatusTitle] = useState('Menunggu Koneksi...');
  const [statusDesc, setStatusDesc] = useState('Siap menerima video dari Shortnews.');
  
  // State untuk Multi-File
  const [queue, setQueue] = useState([]); // Format: { id, file, status: 'pending'|'processing'|'done'|'error', name }
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentFileIndex, setCurrentFileIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [isReady, setIsReady] = useState(false);
  const [isError, setIsError] = useState(false);
  
  const ffmpegRef = useRef(null);

  useEffect(() => {
    initEngine();
  }, []);

  // TRIGGER PROSES OTOMATIS JIKA ADA ANTRIAN BARU
  useEffect(() => {
    if (isReady && queue.length > 0 && !isProcessing) {
        processQueue();
    }
  }, [queue, isReady, isProcessing]);

  const initEngine = async () => {
    try {
      if (!window.FFmpeg) {
        setStatusTitle("Gagal Memuat Sistem");
        setStatusDesc("Script FFmpeg tidak ditemukan.");
        setIsError(true);
        return;
      }

      setStatusTitle('Memanaskan Mesin...');
      const { createFFmpeg } = window.FFmpeg;
      const ffmpeg = createFFmpeg({ 
        log: true,
        corePath: 'https://unpkg.com/@ffmpeg/core@0.10.0/dist/ffmpeg-core.js'
      }); 
      
      ffmpegRef.current = ffmpeg;
      await ffmpeg.load();
      
      setIsReady(true);
      setStatusTitle('Converter Ready!');
      setStatusDesc('Upload banyak file sekaligus? Bisa!');

      if (window.opener) {
        try { window.opener.postMessage('CONVERTER_READY', '*'); } catch (e) {}
      }

      window.addEventListener('message', handleIncomingFile);

    } catch (err) {
      console.error(err);
      setStatusTitle('Gagal Inisialisasi');
      setIsError(true);
    }
  };

  const handleIncomingFile = async (event) => {
    if (event.data && event.data.type === 'VIDEO_DATA') {
        const { blob, filename } = event.data;
        // Masukkan ke antrian sebagai File object
        const file = new File([blob], `${filename}.webm`, { type: 'video/webm' });
        addToQueue([file]);
    }
  };

  const handleManualUpload = (e) => {
      if (e.target.files && e.target.files.length > 0) {
          addToQueue(Array.from(e.target.files));
          // Reset value agar bisa upload ulang
          e.target.value = ""; 
      }
  };

  const addToQueue = (files) => {
      const newItems = files.map(f => ({
          id: Math.random().toString(36).substr(2, 9),
          file: f,
          name: f.name.replace(/\.[^/.]+$/, ""), // Nama tanpa ekstensi
          status: 'pending'
      }));
      setQueue(prev => [...prev, ...newItems]);
  };

  const processQueue = async () => {
      setIsProcessing(true);
      const ffmpeg = ffmpegRef.current;
      const { fetchFile } = window.FFmpeg;

      // Loop cari item yang statusnya 'pending'
      for (let i = 0; i < queue.length; i++) {
          if (queue[i].status !== 'pending') continue; // Skip yang sudah selesai

          setCurrentFileIndex(i);
          const item = queue[i];
          
          // UPDATE STATUS UI: PROCESSING
          setQueue(prev => prev.map((q, idx) => idx === i ? { ...q, status: 'processing' } : q));
          setStatusTitle(`Mengkonversi (${i + 1}/${queue.length})`);
          setStatusDesc(`Sedang memproses: ${item.name}`);
          setProgress(0);

          // Simulasi Progress Visual
          const timer = setInterval(() => {
            setProgress((old) => (old >= 90 ? 90 : old + 5));
          }, 500);

          try {
              // 1. Tulis File
              ffmpeg.FS('writeFile', 'input.webm', await fetchFile(item.file));

              // 2. Convert
              await ffmpeg.run('-i', 'input.webm', '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '28', '-r', '30', '-pix_fmt', 'yuv420p', 'output.mp4');

              // 3. Baca Hasil
              const data = ffmpeg.FS('readFile', 'output.mp4');
              const mp4Url = URL.createObjectURL(new Blob([data.buffer], { type: 'video/mp4' }));

              // 4. Download
              triggerDownload(mp4Url, `${item.name}.mp4`);

              // 5. Cleanup
              try {
                  ffmpeg.FS('unlink', 'input.webm');
                  ffmpeg.FS('unlink', 'output.mp4');
              } catch(e) {}

              // UPDATE STATUS UI: DONE
              setQueue(prev => prev.map((q, idx) => idx === i ? { ...q, status: 'done' } : q));

          } catch (err) {
              console.error(err);
              // UPDATE STATUS UI: ERROR
              setQueue(prev => prev.map((q, idx) => idx === i ? { ...q, status: 'error' } : q));
          } finally {
              clearInterval(timer);
              setProgress(0);
              // Jeda sedikit antar file agar browser tidak hang
              await new Promise(r => setTimeout(r, 1000));
          }
      }

      setIsProcessing(false);
      setStatusTitle('Semua Selesai!');
      setStatusDesc('Semua antrian telah diproses.');
      
      // Auto Close jika ini dari single trigger dan semua sukses
      // (Opsional, dimatikan untuk mode batch agar user bisa lihat list)
      // setTimeout(() => window.close(), 5000);
  };

  const triggerDownload = (url, name) => {
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
  };

  const backToShortnews = () => {
      try {
          if (window.opener && !window.opener.closed) window.opener.focus();
          else alert("Silakan klik Tab Shortnews secara manual di atas ⬆️");
      } catch (e) { alert("Silakan klik Tab Shortnews secara manual di atas ⬆️"); }
  };

  return (
    <div style={styles.container}>
        <div style={styles.card}>
            
            <div style={styles.iconWrapper}>
                {isProcessing ? '⚙️' : isError ? '❌' : '📂'}
            </div>

            <h1 style={{...styles.title, color: isError ? '#d32f2f' : isProcessing ? '#0070f3' : '#333'}}>
                {statusTitle}
            </h1>
            <p style={styles.description}>{statusDesc}</p>

            {/* AREA LIST ANTRIAN */}
            {queue.length > 0 && (
                <div style={styles.queueContainer}>
                    {queue.map((item, idx) => (
                        <div key={item.id} style={{
                            ...styles.queueItem, 
                            borderLeft: item.status === 'processing' ? '4px solid #0070f3' : 
                                        item.status === 'done' ? '4px solid #2e7d32' : 
                                        item.status === 'error' ? '4px solid red' : '4px solid #ccc'
                        }}>
                            <div style={styles.queueName}>{item.name}</div>
                            <div style={styles.queueStatus}>
                                {item.status === 'pending' && '⏳'}
                                {item.status === 'processing' && <span style={{color:'#0070f3'}}>{progress}%</span>}
                                {item.status === 'done' && '✅'}
                                {item.status === 'error' && '❌'}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* TOMBOL UPLOAD MULTIPLE */}
            {!isProcessing && (
                <div style={{marginTop: '20px'}}>
                    <label style={styles.uploadButton}>
                        <span style={{fontSize: '24px', display:'block', marginBottom:'8px'}}>📂</span>
                        {queue.length > 0 ? 'TAMBAH FILE LAGI' : 'UPLOAD BANYAK VIDEO'}
                        <input 
                            type="file" 
                            accept="video/webm, video/mkv"
                            multiple // <--- KUNCI MULTI SELECT
                            onChange={handleManualUpload}
                            style={{display:'none'}}
                        />
                    </label>
                </div>
            )}

            {/* TOMBOL CLEAR */}
            {!isProcessing && queue.length > 0 && (
                <button onClick={() => setQueue([])} style={styles.clearButton}>
                    Bersihkan List
                </button>
            )}
            
            {/* LINK BALIK */}
            {queue.length > 0 && queue.every(q => q.status === 'done') && (
                <div style={{marginTop: '20px'}}>
                    <span onClick={backToShortnews} style={styles.blinkingLink} className="blink-anim">
                        Kembali ke Shortnews
                    </span>
                </div>
            )}

        </div>
        <style>{`
            @keyframes blinkText { 0% { opacity: 1; } 50% { opacity: 0.4; } 100% { opacity: 1; } }
            .blink-anim { animation: blinkText 1.5s infinite ease-in-out; }
        `}</style>
    </div>
  );
}

const styles = {
    container: { minHeight: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center', backgroundColor: '#f0f2f5', fontFamily: "sans-serif", padding: '20px' },
    card: { backgroundColor: '#ffffff', borderRadius: '16px', boxShadow: '0 10px 30px rgba(0,0,0,0.08)', padding: '40px', width: '100%', maxWidth: '500px', textAlign: 'center', maxHeight: '90vh', overflowY: 'auto' },
    iconWrapper: { fontSize: '48px', marginBottom: '20px' },
    title: { margin: '0 0 10px 0', fontSize: '24px', fontWeight: '700' },
    description: { margin: '0 0 20px 0', color: '#666', fontSize: '14px' },
    
    queueContainer: { textAlign: 'left', marginBottom: '20px', maxHeight: '200px', overflowY: 'auto', border: '1px solid #eee', borderRadius: '8px', padding: '5px' },
    queueItem: { display: 'flex', justifyContent: 'space-between', padding: '10px', borderBottom: '1px solid #f0f0f0', fontSize: '13px', alignItems: 'center', backgroundColor: '#fafafa', marginBottom: '2px' },
    queueName: { fontWeight: 'bold', color: '#333', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '80%' },
    queueStatus: { fontWeight: 'bold' },

    uploadButton: { display: 'block', backgroundColor: '#0070f3', color: 'white', padding: '20px', borderRadius: '12px', cursor: 'pointer', fontWeight: 'bold', fontSize: '16px', boxShadow: '0 4px 15px rgba(0, 112, 243, 0.3)', border: '2px dashed rgba(255,255,255,0.3)', transition: 'transform 0.1s', ':active': { transform: 'scale(0.98)' } },
    clearButton: { marginTop: '10px', background: 'none', border: 'none', color: '#888', textDecoration: 'underline', cursor: 'pointer', fontSize: '12px' },
    blinkingLink: { color: '#007bff', fontWeight: 'bold', textDecoration: 'underline', cursor: 'pointer', display: 'inline-block', padding: '5px 10px', borderRadius: '4px', backgroundColor: '#e3f2fd' },
};

export default App;
