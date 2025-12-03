import { useState, useRef, useEffect } from 'react';

// VERSI STABIL (0.10.1) UNTUK NETLIFY

function App() {
  const [status, setStatus] = useState('Memuat Mesin...');
  const [isReady, setIsReady] = useState(false);
  const [progress, setProgress] = useState(0);
  const [isConverting, setIsConverting] = useState(false);
  
  const ffmpegRef = useRef(null);

  useEffect(() => {
    initEngine();
  }, []);

  const initEngine = async () => {
    try {
      if (!window.FFmpeg) {
        setStatus("Error: Script FFmpeg tidak ditemukan.");
        return;
      }
      
      const { createFFmpeg } = window.FFmpeg;
      
      // KUNCI SUKSES DI NETLIFY:
      // Paksa corePath ke UNPKG versi 0.10.0 (Pasangan 0.10.1)
      const ffmpeg = createFFmpeg({ 
        log: true,
        corePath: 'https://unpkg.com/@ffmpeg/core@0.10.0/dist/ffmpeg-core.js'
      }); 
      
      ffmpegRef.current = ffmpeg;
      await ffmpeg.load();
      
      setIsReady(true);
      setStatus('WEBM2MP4 SIAP'); 

    } catch (err) {
      console.error(err);
      setStatus('Gagal Memuat Mesin. Cek Koneksi Internet.');
    }
  };

  const handleManualUpload = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      processVideo(file, file.name.replace(/\.[^/.]+$/, "")); 
  };

  const processVideo = async (blob, filename) => {
    setIsConverting(true);
    setProgress(0);
    setStatus('Sedang Mengkonversi...');

    const ffmpeg = ffmpegRef.current;
    const { fetchFile } = window.FFmpeg;

    // Simulasi progress bar (karena v0.10.1 single thread memblokir update UI)
    const timer = setInterval(() => {
        setProgress((old) => {
            if (old >= 95) return 95;
            return old + 5;
        });
    }, 500);

    try {
        // 1. Tulis File
        ffmpeg.FS('writeFile', 'input.webm', await fetchFile(blob));
        
        // 2. Jalankan Konversi (Rumus Stabilisasi & Kompatibilitas HP)
        // -r 30: Paksa 30fps
        // -pix_fmt yuv420p: Agar bisa diputar di HP/WA/IG
        await ffmpeg.run('-i', 'input.webm', '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '28', '-r', '30', '-pix_fmt', 'yuv420p', 'output.mp4');
        
        // 3. Baca Hasil
        const data = ffmpeg.FS('readFile', 'output.mp4');
        const mp4Url = URL.createObjectURL(new Blob([data.buffer], { type: 'video/mp4' }));

        // 4. Download
        const a = document.createElement('a');
        a.href = mp4Url;
        a.download = `${filename}.mp4`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        // 5. Bersihkan
        try {
            ffmpeg.FS('unlink', 'input.webm');
            ffmpeg.FS('unlink', 'output.mp4');
        } catch(e) {}

        clearInterval(timer);
        setIsConverting(false);
        setProgress(0);
        setStatus('SELESAI! Silakan Upload Lagi.');
        
        // Reset input
        document.getElementById('fileInput').value = "";

    } catch (err) {
        clearInterval(timer);
        console.error(err);
        setIsConverting(false);
        setStatus('Gagal Konversi. Coba lagi.');
    }
  };

  return (
    <div style={styles.container}>
        <div style={styles.card}>
            <div style={styles.header}>
                <h1 style={styles.title}>WEBM <span style={{color:'#0070f3'}}>2</span> MP4</h1>
            </div>

            <p style={{...styles.status, color: status.includes('Gagal') ? 'red' : '#333'}}>
                {status}
            </p>

            {isConverting && (
                <div style={styles.progressContainer}>
                    <div style={styles.progressBarTrack}>
                        <div style={{...styles.progressBarFill, width: `${progress}%`}}></div>
                    </div>
                    <p style={styles.progressText}>{progress}%</p>
                </div>
            )}

            {isReady && !isConverting && (
                <div style={{marginTop: '20px'}}>
                    <label style={styles.uploadButton}>
                        <span style={{fontSize: '24px', display:'block', marginBottom:'5px'}}>📂</span>
                        UPLOAD WEBM DI SINI
                        <input 
                            id="fileInput"
                            type="file" 
                            accept="video/webm, video/mkv"
                            onChange={handleManualUpload}
                            style={{display:'none'}}
                        />
                    </label>
                </div>
            )}
        </div>
    </div>
  );
}

const styles = {
    container: { minHeight: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center', backgroundColor: '#f4f4f9', fontFamily: "sans-serif", padding: '20px' },
    card: { backgroundColor: 'white', padding: '40px', borderRadius: '20px', boxShadow: '0 10px 40px rgba(0,0,0,0.1)', width: '100%', maxWidth: '450px', textAlign: 'center' },
    title: { margin: '10px 0 0', fontSize: '28px', fontWeight: '800', color: '#222' },
    status: { fontSize: '16px', fontWeight: '600', marginBottom: '20px', minHeight: '24px' },
    uploadButton: { display: 'block', backgroundColor: '#0070f3', color: 'white', padding: '30px 20px', borderRadius: '12px', cursor: 'pointer', fontWeight: 'bold', fontSize: '16px', boxShadow: '0 4px 15px rgba(0, 112, 243, 0.3)', transition: 'transform 0.1s', border: '2px dashed rgba(255,255,255,0.3)' },
    progressContainer: { margin: '20px 0' },
    progressBarTrack: { height: '10px', backgroundColor: '#eee', borderRadius: '5px', overflow: 'hidden' },
    progressBarFill: { height: '100%', backgroundColor: '#0070f3', transition: 'width 0.3s' },
    progressText: { marginTop: '5px', fontSize: '12px', color: '#666' }
};

export default App;
