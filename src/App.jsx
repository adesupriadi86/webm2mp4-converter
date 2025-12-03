import { useState, useRef, useEffect } from 'react';

function App() {
  const [statusTitle, setStatusTitle] = useState('Menunggu Koneksi...');
  const [statusDesc, setStatusDesc] = useState('Siap menerima video dari Shortnews.');
  const [progress, setProgress] = useState(0);
  const [isConverting, setIsConverting] = useState(false);
  const [isError, setIsError] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  
  const ffmpegRef = useRef(null);
  const timeoutRef = useRef(null);

  useEffect(() => {
    initEngine();
    return () => clearTimeout(timeoutRef.current);
  }, []);

  const initEngine = async () => {
    try {
      // 1. CEK LIBRARY GLOBAL
      if (!window.FFmpegWASM || !window.FFmpegUtil) {
        setStatusTitle("Gagal Memuat Sistem");
        setStatusDesc("Script FFmpeg v0.12 tidak ditemukan. Cek index.html");
        setIsError(true);
        return;
      }

      setStatusTitle('Memanaskan Mesin...');
      setStatusDesc('Sedang mendownload komponen mesin...');
      
      const { FFmpeg } = window.FFmpegWASM;
      const { toBlobURL } = window.FFmpegUtil;
      
      const ffmpeg = new FFmpeg();
      ffmpegRef.current = ffmpeg;

      ffmpeg.on('log', ({ message }) => console.log(message));
      ffmpeg.on('progress', ({ progress }) => setProgress(Math.round(progress * 100)));

      // 2. DOWNLOAD SEMUA KOMPONEN JADI BLOB (AGAR AMAN DI NETLIFY)
      // Kita pakai versi 0.12.6 untuk Core (Single Threaded)
      const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd';
      const libURL = 'https://unpkg.com/@ffmpeg/ffmpeg@0.12.10/dist/umd';

      // A. Download Core JS
      const coreURL = await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript');
      // B. Download WASM (30MB)
      const wasmURL = await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm');
      // C. Download Worker (PENTING: Ini solusi error Worker CORS)
      const workerURL = await toBlobURL(`${libURL}/814.ffmpeg.js`, 'text/javascript');

      // 3. LOAD MESIN DENGAN FILE LOKAL (BLOB)
      await ffmpeg.load({
        coreURL: coreURL,
        wasmURL: wasmURL,
        classWorkerURL: workerURL // Paksa pakai worker blob kita
      });
      
      // 4. SUKSES
      setStatusTitle('WEBM2MP4 SIAP'); 
      setStatusDesc('Silakan upload video Anda.');
      setIsReadyState();

    } catch (err) {
      console.error(err);
      setStatusTitle('Gagal Inisialisasi');
      setStatusDesc('Error: ' + (err.message || "Cek Koneksi Internet"));
      setIsError(true);
    }
  };

  const setIsReadyState = () => {
      if (window.opener) {
        try { window.opener.postMessage('CONVERTER_READY', '*'); } catch (e) {}
      }
      window.addEventListener('message', handleIncomingFile);
      timeoutRef.current = setTimeout(() => {
          setStatusTitle('⚠️ KONEKSI GAGAL');
          setStatusDesc('Waktu habis. File tidak masuk otomatis. Silakan upload manual di bawah.');
          setIsError(true);
      }, 10000);
  };

  const handleIncomingFile = async (event) => {
    if (event.data && event.data.type === 'VIDEO_DATA') {
        clearTimeout(timeoutRef.current);
        const { blob, filename } = event.data;
        processVideo(blob, filename);
    }
  };

  const handleManualUpload = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      clearTimeout(timeoutRef.current);
      setIsSuccess(false); setIsError(false);
      processVideo(file, file.name.replace(/\.[^/.]+$/, "")); 
  };

  const processVideo = async (blob, filename) => {
    clearTimeout(timeoutRef.current);
    setIsConverting(true);
    setProgress(0);
    setStatusTitle('Sedang Mengkonversi...');
    setStatusDesc('Mohon tunggu sebentar...');

    const ffmpeg = ffmpegRef.current;
    const { fetchFile } = window.FFmpegUtil; // AMBIL DARI UTIL (FIX ERROR UNDEFINED)

    try {
        await ffmpeg.writeFile('input.webm', await fetchFile(blob));
        
        // Convert command v0.12
        await ffmpeg.exec(['-i', 'input.webm', '-c:v', 'libx264', '-preset', 'ultrafast', 'output.mp4']);
        
        const data = await ffmpeg.readFile('output.mp4');
        const mp4Url = URL.createObjectURL(new Blob([data.buffer], { type: 'video/mp4' }));

        triggerDownload(mp4Url, `${filename}.mp4`);

        try {
            await ffmpeg.deleteFile('input.webm');
            await ffmpeg.deleteFile('output.mp4');
        } catch(e) {}

        setIsConverting(false);
        setProgress(100);
        setIsSuccess(true);
        setStatusTitle('Selesai!');
        setStatusDesc('Tab akan tertutup otomatis...');
        
        setTimeout(() => {
            try { if (window.opener) window.opener.focus(); } catch(e) {}
            window.close();
        }, 3000);

    } catch (err) {
        console.error(err);
        setIsConverting(false);
        setIsError(true);
        setStatusTitle('Gagal Konversi');
        setStatusDesc('Error: ' + err.message);
    }
  };

  const triggerDownload = (url, name) => {
      const a = document.createElement('a');
      a.href = url; a.download = name;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
  };

  // ... (Gunakan Return JSX dan Styles yang sama seperti sebelumnya) ...
  // Agar kode tidak terlalu panjang, bagian UI (Return & Styles) 
  // SAMA PERSIS dengan kode yang kamu punya sekarang.
  // Fokus update ada di Logic (atas).
  
  return (
    <div style={styles.container}>
        <div style={styles.card}>
            <div style={styles.iconWrapper}>
                {isSuccess ? '🎉' : isError ? '❌' : isConverting ? '⚙️' : '🎬'}
            </div>
            <h1 style={{...styles.title, color: isError ? '#d32f2f' : isSuccess ? '#2e7d32' : '#333'}}>
                {statusTitle}
            </h1>
            <p style={styles.description}>{statusDesc}</p>

            {isConverting && (
                <div style={styles.progressContainer}>
                    <div style={styles.progressBarTrack}>
                        <div style={{...styles.progressBarFill, width: `${progress}%`}}></div>
                    </div>
                    <p style={styles.progressText}>{progress}% Berjalan</p>
                </div>
            )}

            {(!isConverting && !isSuccess) && (
                <div style={styles.uploadBox}>
                    <div style={styles.warningBox}>
                        <p style={{fontWeight: 'bold', color: '#d32f2f', marginBottom: '5px'}}>⚠️ FILE TIDAK MASUK?</p>
                        <p style={{fontSize: '13px', color: '#555', lineHeight: '1.4'}}>
                            Silakan upload file WebM manual di bawah ini.
                        </p>
                    </div>
                    <div style={styles.arrowAnim}>⬇️</div>
                    <label style={styles.uploadButton}>
                        📁 Upload File WebM
                        <input type="file" accept="video/webm, video/mkv" onChange={handleManualUpload} style={{display:'none'}} />
                    </label>
                </div>
            )}

            {isSuccess && (
                <button onClick={() => { setIsSuccess(false); setStatusTitle('Siap'); setProgress(0); setIsError(false); }} style={styles.resetButton}>
                    🔄 Convert Lagi
                </button>
            )}
        </div>
        <style>{`@keyframes bounceArrow { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(10px); } }`}</style>
    </div>
  );
}

const styles = {
    container: { minHeight: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center', backgroundColor: '#f0f2f5', fontFamily: "sans-serif", padding: '20px' },
    card: { backgroundColor: '#ffffff', borderRadius: '16px', boxShadow: '0 10px 30px rgba(0,0,0,0.08)', padding: '40px', width: '100%', maxWidth: '480px', textAlign: 'center' },
    iconWrapper: { fontSize: '48px', marginBottom: '20px' },
    title: { margin: '0 0 10px 0', fontSize: '24px', fontWeight: '700' },
    description: { margin: '0 0 30px 0', color: '#666', fontSize: '15px', lineHeight: '1.5' },
    progressContainer: { margin: '30px 0' },
    progressBarTrack: { height: '12px', backgroundColor: '#e9ecef', borderRadius: '6px', overflow: 'hidden' },
    progressBarFill: { height: '100%', background: 'linear-gradient(90deg, #00C9FF 0%, #92FE9D 100%)', borderRadius: '6px', transition: 'width 0.3s ease-in-out' },
    progressText: { marginTop: '10px', fontSize: '14px', fontWeight: '600', color: '#555' },
    uploadBox: { marginTop: '20px', borderTop: '2px solid #f0f0f0', paddingTop: '20px' },
    warningBox: { backgroundColor: '#fff5f5', border: '1px solid #ffcdd2', borderRadius: '8px', padding: '15px', marginBottom: '15px', textAlign: 'left' },
    arrowAnim: { fontSize: '32px', color: 'red', margin: '10px 0', animation: 'bounceArrow 1.5s infinite' },
    uploadButton: { display: 'block', width: '100%', backgroundColor: '#d32f2f', color: 'white', padding: '15px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '16px', boxShadow: '0 4px 6px rgba(211,47,47,0.3)', transition: 'transform 0.1s' },
    resetButton: { marginTop: '20px', padding: '12px 24px', backgroundColor: '#2e7d32', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }
};

export default App;
