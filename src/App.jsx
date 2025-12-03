import { useState, useRef, useEffect } from 'react';

// Pastikan index.html memuat script FFmpeg v0.10.1 (Versi Stabil)

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
      if (!window.FFmpeg) {
        setStatusTitle("Gagal Memuat Sistem");
        setStatusDesc("Script FFmpeg tidak ditemukan di index.html");
        setIsError(true);
        return;
      }

      setStatusTitle('Memanaskan Mesin...');
      setStatusDesc('Sedang menyiapkan FFmpeg di browser Anda.');
      
      const { createFFmpeg } = window.FFmpeg;
      
      // GUNAKAN CORE 0.10.0 AGAR STABIL DI NETLIFY
      const ffmpeg = createFFmpeg({ 
        log: true,
        corePath: 'https://unpkg.com/@ffmpeg/core@0.10.0/dist/ffmpeg-core.js'
      }); 
      
      ffmpegRef.current = ffmpeg;
      await ffmpeg.load();
      
      setStatusTitle('Converter Siap!');
      setStatusDesc('Menunggu kiriman file otomatis dari tab sebelah...');

      if (window.opener) {
        try { window.opener.postMessage('CONVERTER_READY', '*'); } catch (e) {}
      }

      window.addEventListener('message', handleIncomingFile);

      // Timeout 10 detik
      timeoutRef.current = setTimeout(() => {
          setStatusTitle('⚠️ KONEKSI GAGAL');
          setStatusDesc('Waktu habis. File tidak masuk otomatis. Silakan upload manual di bawah.');
          setIsError(true);
      }, 10000);

    } catch (err) {
      console.error(err);
      setStatusTitle('Gagal Inisialisasi');
      setStatusDesc('Gagal memuat engine. Cek koneksi internet.');
      setIsError(true);
    }
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
      
      // Reset State sebelum mulai
      clearTimeout(timeoutRef.current);
      setIsSuccess(false); 
      setIsError(false);
      
      processVideo(file, file.name.replace(/\.[^/.]+$/, "")); 
  };

  const processVideo = async (blob, filename) => {
    setIsConverting(true);
    setProgress(0);
    setStatusTitle('Sedang Mengkonversi...');
    setStatusDesc('Menstabilkan frame rate video...');

    const ffmpeg = ffmpegRef.current;
    const { fetchFile } = window.FFmpeg;

    // Simulasi progress (karena v0.10.1 single thread memblokir update real-time)
    const timer = setInterval(() => {
        setProgress((old) => {
            if (old >= 95) return 95;
            return old + 2;
        });
    }, 500);

    try {
        // 1. Tulis File Input
        ffmpeg.FS('writeFile', 'input.webm', await fetchFile(blob));
        
        // 2. JALANKAN KONVERSI (DENGAN RUMUS PERBAIKAN)
        // -r 30             : Paksa 30 FPS (Anti patah-patah)
        // -c:v libx264      : Codec standar MP4
        // -preset ultrafast : Supaya cepat selesai
        // -pix_fmt yuv420p  : Supaya bisa diputar di HP/WA/IG (Wajib!)
        // -movflags +faststart : Optimasi web
        await ffmpeg.run(
            '-i', 'input.webm', 
            '-r', '30', 
            '-c:v', 'libx264', 
            '-preset', 'ultrafast', 
            '-crf', '28', 
            '-pix_fmt', 'yuv420p', 
            '-movflags', '+faststart', 
            'output.mp4'
        );
        
        // 3. Baca Hasil
        const data = ffmpeg.FS('readFile', 'output.mp4');
        
        // Validasi hasil (Cegah error file kosong)
        if (data.byteLength === 0) {
             throw new Error("Hasil konversi kosong (0 bytes).");
        }

        const mp4Url = URL.createObjectURL(new Blob([data.buffer], { type: 'video/mp4' }));

        // 4. Download
        triggerDownload(mp4Url, `${filename}.mp4`);

        // 5. Bersihkan Memori
        try {
            ffmpeg.FS('unlink', 'input.webm');
            ffmpeg.FS('unlink', 'output.mp4');
        } catch(e) {}

        clearInterval(timer);
        setIsConverting(false);
        setProgress(100);
        setIsSuccess(true);
        setStatusTitle('Selesai!');
        
        // LOGIKA AUTO CLOSE
        setStatusDesc('Tab ini akan tertutup otomatis dalam 3 detik...');
        setTimeout(() => {
            try {
                if (window.opener && !window.opener.closed) window.opener.focus();
            } catch (e) {}
            window.close();
        }, 3000);

    } catch (err) {
        clearInterval(timer);
        console.error("FFmpeg Error:", err);
        setIsConverting(false);
        setIsError(true);
        setStatusTitle('Gagal Konversi');
        setStatusDesc('Terjadi kesalahan saat memproses video. Coba refresh.');
    }
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
          if (window.opener && !window.opener.closed) {
              window.opener.focus();
          } else {
              alert("Browser membatasi navigasi otomatis. Silakan klik Tab Shortnews secara manual di atas ⬆️");
          }
      } catch (e) {
          alert("Silakan klik Tab Shortnews secara manual di atas ⬆️");
      }
  };

  return (
    <div style={styles.container}>
        <div style={styles.card}>
            <div style={styles.iconWrapper}>
                {isSuccess ? '🎉' : isError ? '❌' : isConverting ? '⚙️' : '🎬'}
            </div>
            <h1 style={{...styles.title, color: isError ? '#d32f2f' : isSuccess ? '#2e7d32' : '#333'}}>
                {statusTitle}
            </h1>
            
            <p style={styles.description}>
                {isSuccess ? (
                    <span>
                        File MP4 berhasil diunduh. <br/>
                        <span onClick={backToShortnews} style={styles.blinkingLink} className="blink-anim">
                            Klik di sini untuk Kembali ke Shortnews
                        </span>
                    </span>
                ) : (
                    statusDesc
                )}
            </p>

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
                        <p style={{fontWeight: 'bold', color: '#d32f2f', marginBottom: '5px'}}>
                            ⚠️ FILE TIDAK MASUK OTOMATIS?
                        </p>
                        <p style={{fontSize: '13px', color: '#555', lineHeight: '1.4'}}>
                            1. Kembali ke tab <span onClick={backToShortnews} style={styles.inlineLink}>Shortnews</span>.<br/>
                            2. Klik tombol <b>"Unduh File Asli (WebM)"</b>.<br/>
                            3. Kembali ke sini dan upload file tersebut di bawah.
                        </p>
                    </div>
                    <div style={styles.arrowAnim}>⬇️</div>
                    <label style={styles.uploadButton}>
                        📁 Upload File WebM Di Sini
                        <input type="file" accept="video/webm, video/mkv" onChange={handleManualUpload} style={{display:'none'}} />
                    </label>
                </div>
            )}

            {isSuccess && (
                <button onClick={() => { setIsSuccess(false); setStatusTitle('Siap Convert Lagi'); setStatusDesc('Silakan upload file baru.'); setProgress(0); setIsError(false); }} style={styles.resetButton}>
                    🔄 Convert Video Lain
                </button>
            )}
        </div>
        <style>{`
            @keyframes bounceArrow { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(10px); } }
            @keyframes blinkText { 0% { opacity: 1; } 50% { opacity: 0.4; } 100% { opacity: 1; } }
            .blink-anim { animation: blinkText 1.5s infinite ease-in-out; }
        `}</style>
    </div>
  );
}

const styles = {
    container: { minHeight: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center', backgroundColor: '#f0f2f5', fontFamily: "sans-serif", padding: '20px' },
    card: { backgroundColor: '#ffffff', borderRadius: '16px', boxShadow: '0 10px 30px rgba(0,0,0,0.08)', padding: '40px', width: '100%', maxWidth: '480px', textAlign: 'center', transition: 'all 0.3s ease' },
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
    resetButton: { marginTop: '20px', padding: '12px 24px', backgroundColor: '#2e7d32', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' },
    blinkingLink: { color: '#007bff', fontWeight: 'bold', textDecoration: 'underline', cursor: 'pointer', display: 'inline-block', marginTop: '8px', padding: '5px 10px', borderRadius: '4px', backgroundColor: '#e3f2fd' },
    inlineLink: { color: '#007bff', fontWeight: 'bold', textDecoration: 'underline', cursor: 'pointer' }
};

export default App;
