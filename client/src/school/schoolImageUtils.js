export function resizeSchoolImage(file) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    return Promise.reject(new Error('Gunakan file JPG, PNG, atau WebP.'));
  }
  if (file.size > 5 * 1024 * 1024) {
    return Promise.reject(new Error('Ukuran file maksimal 5 MB.'));
  }

  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const scale = Math.min(1, 720 / Math.max(image.naturalWidth, image.naturalHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const context = canvas.getContext('2d');
      if (!context) {
        reject(new Error('Gambar tidak dapat diproses di browser ini.'));
        return;
      }
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error('Gambar gagal diproses.'));
          return;
        }
        if (blob.size > 500 * 1024) {
          reject(new Error('Ukuran gambar hasil kompresi masih terlalu besar.'));
          return;
        }
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('Gambar gagal dibaca.'));
        reader.readAsDataURL(blob);
      }, 'image/webp', 0.84);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('File yang dipilih bukan gambar yang valid.'));
    };
    image.src = objectUrl;
  });
}
