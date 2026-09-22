import fs from 'fs/promises';
import path from 'path';
import lockfile from 'proper-lockfile';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import { DlqEntry } from '../types';

export class DlqStorageService {
    private readonly filePath: string;

    constructor() {
        this.filePath = path.resolve(env.DLQ_FILE_PATH);
    }

    async append(entry: Omit<DlqEntry, 'id' | 'failedAt'>): Promise<void> {
        const fullEntry: DlqEntry = {
            ...entry,
            id: crypto.randomUUID(),
            failedAt: new Date().toISOString(),
        };

        await fs.mkdir(path.dirname(this.filePath), { recursive: true });

        try {
            await fs.access(this.filePath);
        } catch {
            await fs.writeFile(this.filePath, '[]', 'utf-8');
        }

        let release: (() => Promise<void>) | undefined;
        try {
            release = await lockfile.lock(this.filePath, {
                retries: { retries: 5, minTimeout: 100, maxTimeout: 500 },
            });

            const raw = await fs.readFile(this.filePath, 'utf-8');
            const entries: DlqEntry[] = raw.trim() ? JSON.parse(raw) : [];
            entries.push(fullEntry);
            await fs.writeFile(this.filePath, JSON.stringify(entries, null, 2), 'utf-8');
        } catch (err) {
            logger.error({ err, entryId: fullEntry.id }, 'CRITICAL: Failed to write entry to DLQ file');
            throw err;
        } finally {
            if (release) await release();
        }
    }
}

export const dlqStorageService = new DlqStorageService();