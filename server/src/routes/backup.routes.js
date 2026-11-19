import { Router } from 'express';
import multer from 'multer';
import { createBackupArchive, restoreBackupArchive, backupLimits } from '../utils/backup-archive.js';
import {
  publicBackupSettings, readBackupSettings, updateBackupSettings
} from '../utils/backup-settings.js';
import { sendConfiguredBackup, sendTelegramTest } from '../utils/telegram-backup.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { files: 1, fileSize: backupLimits.maxUploadBytes }
});

export default function createBackupRouter(scope) {
  const router = Router();
  const schoolIdFor = (req) => scope === 'school' ? String(req.school.id) : null;

  router.get('/settings', async (req, res, next) => {
    try {
      const settings = await readBackupSettings(scope, schoolIdFor(req));
      return res.json({ settings: publicBackupSettings(settings) });
    } catch (error) {
      return next(error);
    }
  });

  router.put('/settings', async (req, res, next) => {
    try {
      const settings = await updateBackupSettings(scope, req.body, schoolIdFor(req));
      return res.json({
        settings: publicBackupSettings(settings),
        message: 'Pengaturan backup Telegram berhasil disimpan.'
      });
    } catch (error) {
      if (error.status) return res.status(error.status).json({ message: error.message });
      return next(error);
    }
  });

  router.get('/download', async (req, res, next) => {
    try {
      const schoolId = schoolIdFor(req);
      const archive = await createBackupArchive(scope, schoolId);
      const date = new Date().toISOString().slice(0, 10);
      const fileName = `maca-${scope === 'school' ? `sekolah-${schoolId}` : 'platform'}-${date}.json.gz`;
      res.setHeader('Content-Type', 'application/gzip');
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      res.setHeader('Cache-Control', 'no-store');
      return res.send(archive);
    } catch (error) {
      if (error.status) return res.status(error.status).json({ message: error.message });
      return next(error);
    }
  });

  router.post('/restore', (req, res, next) => {
    upload.single('backup')(req, res, async (uploadError) => {
      if (uploadError) {
        const status = uploadError instanceof multer.MulterError
          ? uploadError.code === 'LIMIT_FILE_SIZE' ? 413 : 400
          : 400;
        return res.status(status).json({
          message: status === 413
            ? 'Ukuran file backup maksimal 100 MB.'
            : uploadError.message || 'File backup tidak dapat diunggah.'
        });
      }
      if (!req.file) return res.status(400).json({ message: 'Pilih file backup terlebih dahulu.' });
      try {
        const result = await restoreBackupArchive(req.file.buffer, scope, schoolIdFor(req));
        return res.json(result);
      } catch (error) {
        if (error.status) return res.status(error.status).json({ message: error.message });
        return res.status(400).json({ message: error.message || 'Backup tidak dapat dipulihkan.' });
      }
    });
  });

  router.post('/telegram/test', async (req, res, next) => {
    try {
      const result = await sendTelegramTest(scope, schoolIdFor(req));
      return res.json(result);
    } catch (error) {
      if (error.status) return res.status(error.status).json({ message: error.message });
      return next(error);
    }
  });

  router.post('/telegram/backup', async (req, res, next) => {
    try {
      const schoolId = schoolIdFor(req);
      const schoolName = scope === 'school' ? req.school.name : '';
      const result = await sendConfiguredBackup(scope, schoolId, schoolName);
      return res.json(result);
    } catch (error) {
      if (error.status) return res.status(error.status).json({ message: error.message });
      return res.status(400).json({ message: error.message || 'Backup Telegram gagal dikirim.' });
    }
  });

  return router;
}
