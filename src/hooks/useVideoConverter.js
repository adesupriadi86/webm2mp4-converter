// src/hooks/useVideoConverter.js
import { useState, useRef, useEffect } from 'react';

export const useVideoConverter = () => {
  const [ready, setReady] = useState(false);
  const [converting, setConverting] = useState(false);
  const [message, setMessage] = useState('Memuat sistem...');
  const ffmpegRef = useRef(null);

  // 1. Load System saat pertama kali dipanggil
  useEffect(() => {
    const load = async () => {
      try {
        if (!window.FFmpeg) {
            setMessage("Error: Script FFmpeg belum terpasang di index.html");
            return;
        }

        const { createFFmpeg } = window.FFmpeg;
        // log: true agar kita bisa lihat proses di console
        const ffmpeg = createFFmpeg({ log: true });
        
        await ffmpeg.load();
        
        ffmpegRef.current = ffmpeg;
        setReady(true);
        setMessage('Siap Convert!');
      } catch (err) {
        console.error("Gagal load FFmpeg:", err);
        setMessage('Gagal memuat sistem.');
      }
    };
    
    load();
  }, []);

  // 2. Fungsi Utama: Ubah WebM jadi MP4
  const convertToMp4 = async (webmBlob) => {
    if (!ready) {
        alert("Tunggu sebentar, mesin converter sedang dipanaskan...");
        return null;
    }

    setConverting(true);
    setMessage('Sedang mengubah ke MP4...');

    try {
      const { fetchFile } = window.FFmpeg;
      const ffmpeg = ffmpegRef.current;

      // Tulis file input ke memori
      ffmpeg.FS('writeFile', 'rekaman.webm', await fetchFile(webmBlob));

      // Jalankan perintah konversi
      // -preset ultrafast: Supaya user tidak menunggu lama
      await ffmpeg.run('-i', 'rekaman.webm', '-c:v', 'libx264', '-preset', 'ultrafast', 'video.mp4');

      // Baca file output
      const data = ffmpeg.FS('readFile', 'video.mp4');

      // Buat URL MP4
      const mp4Blob = new Blob([data.buffer], { type: 'video/mp4' });
      const mp4Url = URL.createObjectURL(mp4Blob);

      // Bersihkan memori agar browser tidak berat
      ffmpeg.FS('unlink', 'rekaman.webm');
      ffmpeg.FS('unlink', 'video.mp4');

      setConverting(false);
      setMessage('Selesai!');
      return mp4Url;

    } catch (error) {
      console.error(error);
      setConverting(false);
      setMessage('Terjadi Error saat convert.');
      return null;
    }
  };

  return { ready, converting, message, convertToMp4 };
};