import { ChatService, MESSAGE_EDIT_WINDOW_MS } from '../../services/chat.service';
import * as db from '../../config/database';

jest.mock('../../config/database', () => ({
  query: jest.fn(),
}));

jest.mock('../../config/socket', () => ({
  emitToConversation: jest.fn(),
  emitToUser: jest.fn(),
  getOnlineUsers: jest.fn(() => []),
  joinConversationRoom: jest.fn(),
}));

const mockQuery = db.query as jest.MockedFunction<typeof db.query>;
const svc = new ChatService();

const ok = (rows: any[]) => ({ rows, command: '', rowCount: rows.length, oid: 0, fields: [] }) as any;

// editMessage has a 15-minute window after which the sender can no longer
// edit their own message. The backend MUST enforce this independent of the
// UI so a stale tab / hand-crafted PATCH can't slip through.
describe('ChatService.editMessage — 15-minute edit window', () => {
  beforeEach(() => mockQuery.mockReset());

  it('allows the owner to edit within the window', async () => {
    const now = Date.now();
    const recentTimestamp = new Date(now - 60_000).toISOString(); // 1 min ago
    mockQuery
      .mockResolvedValueOnce(ok([{
        sender_id: 'user-1',
        is_system: false,
        created_at: recentTimestamp,
      }]))
      .mockResolvedValueOnce(ok([{ id: 'msg-1', edited_at: new Date().toISOString() }]));

    await expect(
      svc.editMessage('conv-1', 'msg-1', 'updated content', 'user-1'),
    ).resolves.toBeTruthy();
  });

  it('rejects edits after the window expires', async () => {
    const tooOld = new Date(Date.now() - MESSAGE_EDIT_WINDOW_MS - 1000).toISOString();
    mockQuery.mockResolvedValueOnce(ok([{
      sender_id: 'user-1',
      is_system: false,
      created_at: tooOld,
    }]));

    await expect(
      svc.editMessage('conv-1', 'msg-1', 'too late', 'user-1'),
    ).rejects.toMatchObject({ statusCode: 403, key: 'EDIT_WINDOW_EXPIRED' });
  });

  it('rejects edits by a non-owner regardless of age', async () => {
    const recent = new Date(Date.now() - 60_000).toISOString();
    mockQuery.mockResolvedValueOnce(ok([{
      sender_id: 'user-1',
      is_system: false,
      created_at: recent,
    }]));

    await expect(
      svc.editMessage('conv-1', 'msg-1', 'hacked', 'attacker'),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('rejects edits to system messages', async () => {
    const recent = new Date(Date.now() - 60_000).toISOString();
    mockQuery.mockResolvedValueOnce(ok([{
      sender_id: 'user-1',
      is_system: true,
      created_at: recent,
    }]));

    await expect(
      svc.editMessage('conv-1', 'msg-1', 'fake', 'user-1'),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('throws 404 if the message does not exist', async () => {
    mockQuery.mockResolvedValueOnce(ok([]));
    await expect(
      svc.editMessage('conv-1', 'missing', 'x', 'user-1'),
    ).rejects.toMatchObject({ statusCode: 404, key: 'NOT_FOUND' });
  });
});
