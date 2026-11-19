import { Router } from 'express';
import { pool } from '../config/database.js';
import { requireSchoolPermission } from '../middleware/require-school-permission.js';

const router = Router();

function validId(value) {
  return /^\d+$/.test(String(value || '')) && Number(value) > 0;
}

function readMessage(body) {
  const subject = typeof body?.subject === 'string' ? body.subject.trim() : '';
  const message = typeof body?.message === 'string' ? body.message.trim() : '';
  if (subject && (subject.length < 4 || subject.length > 180)) {
    return { error: 'Subjek tiket harus terdiri dari 4 sampai 180 karakter.' };
  }
  if (message.length < 10 || message.length > 5000) {
    return { error: 'Pesan harus terdiri dari 10 sampai 5.000 karakter.' };
  }
  return { subject, message };
}

router.get('/tickets', requireSchoolPermission('support', 'view'), async (req, res, next) => {
  const page = req.query.page == null ? 1 : Number(req.query.page);
  const limit = req.query.limit == null ? 20 : Number(req.query.limit);
  if (!Number.isSafeInteger(page) || page < 1 || page > 1000000
      || !Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    return res.status(400).json({ message: 'Nomor halaman atau jumlah tiket tidak valid.' });
  }

  try {
    const [[count], [tickets]] = await Promise.all([
      pool.execute('SELECT COUNT(*) AS total FROM platform_tickets WHERE school_id = ?', [req.school.id]),
      pool.execute(
        `SELECT t.id, t.subject, t.status, t.created_at,
                (SELECT m.message FROM platform_ticket_messages m
                 WHERE m.ticket_id = t.id ORDER BY m.id DESC LIMIT 1) AS last_message
         FROM platform_tickets t
         WHERE t.school_id = ?
         ORDER BY t.created_at DESC, t.id DESC
         LIMIT ? OFFSET ?`,
        [req.school.id, limit, (page - 1) * limit]
      )
    ]);
    const total = Number(count.total);
    return res.json({
      tickets: tickets.map((ticket) => ({ ...ticket, id: String(ticket.id) })),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/tickets/:id', requireSchoolPermission('support', 'view'), async (req, res, next) => {
  if (!validId(req.params.id)) return res.status(400).json({ message: 'ID tiket tidak valid.' });
  try {
    const [[ticket]] = await pool.execute(
      `SELECT id, subject, status, created_at
       FROM platform_tickets WHERE id = ? AND school_id = ? LIMIT 1`,
      [req.params.id, req.school.id]
    );
    if (!ticket) return res.status(404).json({ message: 'Tiket tidak ditemukan.' });
    const [messages] = await pool.execute(
      `SELECT id, sender_type, message, created_at
       FROM platform_ticket_messages
       WHERE ticket_id = ? AND school_id = ?
       ORDER BY id ASC`,
      [ticket.id, req.school.id]
    );
    return res.json({
      ticket: { ...ticket, id: String(ticket.id) },
      messages: messages.map((message) => ({ ...message, id: String(message.id) }))
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/tickets', requireSchoolPermission('support', 'edit'), async (req, res, next) => {
  const { subject, message, error } = readMessage(req.body);
  if (error) return res.status(400).json({ message: error });
  if (!subject) return res.status(400).json({ message: 'Subjek tiket wajib diisi.' });

  let connection;
  let transactionStarted = false;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    transactionStarted = true;
    const [result] = await connection.execute(
      'INSERT INTO platform_tickets (school_id, subject) VALUES (?, ?)',
      [req.school.id, subject]
    );
    await connection.execute(
      `INSERT INTO platform_ticket_messages (ticket_id, school_id, sender_type, user_id, message)
       VALUES (?, ?, 'school', ?, ?)`,
      [result.insertId, req.school.id, req.school.userId, message]
    );
    await connection.commit();
    transactionStarted = false;
    return res.status(201).json({
      ticket: { id: String(result.insertId), subject, status: 'open' },
      message: 'Tiket bantuan berhasil dikirim.'
    });
  } catch (error) {
    if (transactionStarted && connection) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        error.rollbackError = rollbackError;
      }
    }
    return next(error);
  } finally {
    if (connection) connection.release();
  }
});

router.post('/tickets/:id/messages', requireSchoolPermission('support', 'edit'), async (req, res, next) => {
  if (!validId(req.params.id)) return res.status(400).json({ message: 'ID tiket tidak valid.' });
  const { message, error } = readMessage(req.body);
  if (error) return res.status(400).json({ message: error });

  let connection;
  let transactionStarted = false;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    transactionStarted = true;
    const [[ticket]] = await connection.execute(
      'SELECT id, status FROM platform_tickets WHERE id = ? AND school_id = ? FOR UPDATE',
      [req.params.id, req.school.id]
    );
    if (!ticket) {
      await connection.rollback();
      transactionStarted = false;
      return res.status(404).json({ message: 'Tiket tidak ditemukan.' });
    }
    if (ticket.status === 'closed') {
      await connection.rollback();
      transactionStarted = false;
      return res.status(409).json({ message: 'Tiket sudah ditutup dan tidak dapat dibalas.' });
    }
    const [result] = await connection.execute(
      `INSERT INTO platform_ticket_messages (ticket_id, school_id, sender_type, user_id, message)
       VALUES (?, ?, 'school', ?, ?)`,
      [ticket.id, req.school.id, req.school.userId, message]
    );
    await connection.execute(
      "UPDATE platform_tickets SET status = 'open' WHERE id = ? AND school_id = ?",
      [ticket.id, req.school.id]
    );
    await connection.commit();
    transactionStarted = false;
    return res.status(201).json({
      message: { id: String(result.insertId), sender_type: 'school', message },
      ticketStatus: 'open'
    });
  } catch (error) {
    if (transactionStarted && connection) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        error.rollbackError = rollbackError;
      }
    }
    return next(error);
  } finally {
    if (connection) connection.release();
  }
});

export default router;
