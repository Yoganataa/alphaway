# AlphaWay SQLite and File Storage Contract

AlphaWay uses **Bun's native SQLite (\`bun:sqlite\`) as its only persistent application-state database**. The path and operator contract follows the relevant 9router-go conventions while retaining AlphaWay's own schema, authentication model, encrypted secrets, and runtime.

## Data directory and database path

The canonical settings are:

- \`DATA_DIR\`: root for persistent application files. It can be supplied through the process environment or \`.env\`.
- \`DB_PATH\`: SQLite file path. It can be supplied through the process environment or \`.env\`; it takes precedence over the default.
- \`ALPHAWAY_STATE_DIR\` and \`OPENCODE_BRIDGE_STATE_DIR\`: compatibility aliases for \`DATA_DIR\`.
- \`ALPHAWAY_DB_PATH\`: compatibility alias for \`DB_PATH\`.
- \`ALPHAWAY_ENV_FILE\`: optional explicit path to the environment file.

Process environment values take precedence over values read from \`.env\`. Canonical variables take precedence over compatibility aliases.

| Platform | Default data directory | Default database |
|---|---|---|
| Linux / macOS | \`~/.alphaway\` | \`~/.alphaway/db/data.sqlite\` |
| Windows | \`%APPDATA%\\AlphaWay\` | \`%APPDATA%\\AlphaWay\\db\\data.sqlite\` |

If \`DB_PATH\` names an existing directory, AlphaWay checks these layouts in order, matching 9router-go's database-directory resolver:

1. \`db/data.sqlite\`
2. \`data.sqlite\`
3. \`9router.db\`
4. AlphaWay compatibility file \`alphaway.sqlite\`

Otherwise, \`DB_PATH\` is treated as the explicit database file path. The special value \`:memory:\` keeps Bun SQLite's in-memory database mode.

When \`DB_PATH\` is overridden, AlphaWay stores encrypted migration and manual backups under \`backups/\` beside the configured database file; the encryption key remains under \`DATA_DIR/secret-encryption.key\`. Thus the default backup directory is \`$DATA_DIR/db/backups/\`, but an external \`DB_PATH\` relocates the backup directory with the database.

### Upgrade compatibility

Older AlphaWay installations stored the SQLite file at \`$DATA_DIR/alphaway.sqlite\`. To avoid silently opening a new, empty database during an upgrade, AlphaWay continues using that old file when the new \`$DATA_DIR/db/data.sqlite\` does not exist. Once the new canonical file exists, it becomes active.

This is a compatibility fallback, not an automatic file move. Operators should stop AlphaWay, make and verify an encrypted backup, then perform any planned path relocation deliberately. Never copy only the main database file while WAL may contain committed pages.

## Persistent file layout

A default installation uses this structure:

\`\`\`text
~/.alphaway/
├── app/                       # replaceable application files
├── .env                       # persistent environment configuration
├── db/
│   ├── data.sqlite            # canonical AlphaWay database
│   ├── data.sqlite-wal        # SQLite write-ahead log (when present)
│   ├── data.sqlite-shm        # SQLite shared-memory coordination (when present)
│   └── backups/
│       └── alphaway-before-*.sqlite.awenc
├── secret-encryption.key      # 32-byte AES-256-GCM master key
├── alphaway.pid               # daemon metadata, when daemon mode is used
├── alphaway.log               # daemon log, when daemon mode is used
├── pool-health.json           # bounded, non-secret proxy health cache
└── SOUL.md                    # optional global personality file
\`\`\`

The JSON-named proxy file is a runtime cache, not a second application-state store. Provider settings, proxy intent, TokenSaver configuration, usage events, API keys, users, and sessions are stored in SQLite. Old standalone configuration files are ignored and are not imported, rewritten, or deleted.

## SQLite connection and permissions

On file-backed databases AlphaWay configures:

- \`journal_mode=WAL\`;
- \`synchronous=NORMAL\`;
- \`busy_timeout=5000\`;
- \`foreign_keys=ON\`;
- \`temp_store=MEMORY\`;
- \`cache_size=-8000\` (8 MiB page cache);
- \`mmap_size=30000000\` (approximately 30 MB);
- \`secure_delete=ON\`.

The database parent directory is restricted to POSIX mode \`0700\`, and the database file to \`0600\`. WAL/SHM files are protected by the private parent directory. Windows ACL behavior remains a Phase 7 verification item.

WAL improves reader/writer concurrency; it does not make application state safe for multiple independent writers. Run one AlphaWay writer per database file. Do not run AlphaWay and 9router-go concurrently against the same file.

## Database schema compatibility

AlphaWay and 9router-go use SQLite, but their application schemas are not interchangeable. AlphaWay has its own versioned schema and migrations for custom providers, request logs, app settings, managed API keys, administrators, and sessions. It does not create the 9router upstream tables (\`providerConnections\`, \`providerNodes\`, \`apiKeys\`, \`usageHistory\`, and related tables).

A shared SQLite file is therefore **not** a supported integration or migration mechanism. A future data migration between the products must explicitly map schemas, credential formats, settings, and usage semantics and must be tested against a copy.

## Encrypted physical backups

AlphaWay's migration backup helper uses SQLite \`VACUUM INTO\` after a WAL checkpoint, then encrypts the snapshot with AES-256-GCM. The resulting \`.sqlite.awenc\` file is an encrypted physical database backup, not a settings export.

Create a manual snapshot while AlphaWay is running:

\`\`\`bash
bun run db:backup
\`\`\`

The command prints the created path under the configured database directory's \`backups/\` folder (default \`$DATA_DIR/db/backups/\`). It uses the same \`ALPHAWAY_ENCRYPTION_KEY\` or \`$DATA_DIR/secret-encryption.key\` as encrypted credentials. Store the key and backup together in a protected backup location. Losing the key makes encrypted database backups and stored credentials unrecoverable.

Restore an encrypted snapshot only after stopping the AlphaWay service:

\`\`\`bash
bun run db:restore -- /absolute/path/to/alphaway-before-operator-manual-....sqlite.awenc
\`\`\`

The restore path stages the decrypted database, runs SQLite \`PRAGMA quick_check\`, checkpoints and backs up the existing database, then replaces the destination. It rejects invalid encrypted files and does not overwrite the source backup. The CLI refuses restore when it detects a live AlphaWay daemon PID file, but the operator must also stop foreground/service-managed instances before restoring.

For a manual filesystem-level restore, stop AlphaWay and preserve the database together with any \`-wal\` and \`-shm\` files. A live copy of only \`data.sqlite\` is not a consistent backup.

## Dashboard diagnostics and maintenance

- \`GET /api/settings/database/stats\` (also retained at the original \`GET /api/settings/database\`) reports database size from SQLite page metrics, reclaimable bytes from \`freelist_count\`, WAL size, and AlphaWay table counts.
- \`POST /api/settings/database/vacuum\` performs a WAL checkpoint, \`VACUUM\`, then a final truncating checkpoint. It requires an administrator session.
- The maintenance UI displays current path, allocated size, and reclaimable SQLite pages.

AlphaWay's request log and usage model is not the same as 9router-go's \`requestDetails\`/billing \`usageHistory\` model. Do not copy 9router-go's pruning rules or delete AlphaWay request rows without defining retention semantics for the dashboard and usage aggregates first.

## No standalone JSON persistence

Flat files such as \`custom_providers.json\`, \`usage_stats.json\`, \`tokensaver.json\`, and \`proxy.json\` are not runtime persistence. AlphaWay neither imports nor mutates these files. JSON remains used for HTTP request/response bodies and values serialized inside SQLite columns; that is not file-based application storage.
