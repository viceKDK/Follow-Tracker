(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.FollowTrackerStorageMigrations = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const STORAGE_SCHEMA_VERSION = 2;
  const STORAGE_META_KEY = "ft_storage_meta";
  const MIGRATION_BACKUP_KEY = "ft_storage_migration_backup";
  const DEFAULT_SETTINGS = Object.freeze({
    minTrustedCoverage: 0.95,
    minHardCoverage: 0.8,
    minRemovalConfidence: 0.95,
    maxTrustedDropRatio: 0.15,
    confirmRemovalsAfter: 2,
    autoAcceptTrusted: false,
    backupReminderDays: 30,
    backupReminderReports: 5,
  });

  function stableStringify(value) {
    if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
    if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
    return JSON.stringify(value);
  }

  function checksum(value) {
    const text = stableStringify(value);
    let hash = 2166136261;
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
  }

  function currentVersion(items) {
    const value = items && items[STORAGE_META_KEY];
    const explicit = Number(value && value.schemaVersion);
    if (Number.isInteger(explicit) && explicit >= 0) return explicit;
    const keys = Object.keys(items || {});
    if (keys.some((key) => key.startsWith("ft_cache_"))) return 0;
    if (keys.some((key) => key === "ft_settings" || key.startsWith("ft_history_") || key.startsWith("ft_timeline_"))) return 1;
    return 0;
  }

  function normalizeSettings(value) {
    const input = value && typeof value === "object" ? value : {};
    return { ...DEFAULT_SETTINGS, ...input, storageSchemaVersion: STORAGE_SCHEMA_VERSION };
  }

  function planStorageMigration(itemsValue, options) {
    const items = itemsValue && typeof itemsValue === "object" ? itemsValue : {};
    const settings = options && typeof options === "object" ? options : {};
    const now = new Date(settings.now || Date.now()).toISOString();
    const fromVersion = currentVersion(items);
    if (fromVersion > STORAGE_SCHEMA_VERSION) {
      throw new Error(`El almacenamiento usa la versión futura ${fromVersion}; esta extensión sólo entiende hasta ${STORAGE_SCHEMA_VERSION}.`);
    }
    if (fromVersion === STORAGE_SCHEMA_VERSION) {
      return { migrated: false, fromVersion, toVersion: STORAGE_SCHEMA_VERSION, updates: {}, removals: [], backup: null,
        meta: items[STORAGE_META_KEY] };
    }

    const updates = {};
    const removals = [];
    const originalValues = {};
    const createdKeys = [];
    const touched = new Set();
    function remember(key) {
      if (touched.has(key)) return;
      touched.add(key);
      if (Object.prototype.hasOwnProperty.call(items, key)) originalValues[key] = items[key];
      else createdKeys.push(key);
    }
    function setValue(key, value) { remember(key); updates[key] = value; }
    function removeValue(key) { remember(key); removals.push(key); }

    if (fromVersion < 1) {
      setValue("ft_settings", normalizeSettings(items.ft_settings));
      Object.keys(items).filter((key) => key.startsWith("ft_cache_")).forEach(removeValue);
      Object.keys(items).filter((key) => key.startsWith("ft_history_")).forEach((historyKey) => {
        const profile = historyKey.slice("ft_history_".length);
        const timelineKey = `ft_timeline_${profile}`;
        if (!items[timelineKey] && typeof settings.buildTimeline === "function") {
          const timeline = settings.buildTimeline(items[historyKey]);
          if (timeline) setValue(timelineKey, timeline);
        }
      });
    }

    if (fromVersion < 2) {
      setValue("ft_settings", normalizeSettings(updates.ft_settings || items.ft_settings));
    }

    remember(STORAGE_META_KEY);
    const migrationId = `storage-${fromVersion}-to-${STORAGE_SCHEMA_VERSION}-${now.replace(/[^0-9]/g, "").slice(0, 14)}`;
    const meta = { schemaVersion: STORAGE_SCHEMA_VERSION, previousVersion: fromVersion, migratedAt: now,
      migrationId, appVersion: String(settings.appVersion || "unknown") };
    const backupPayload = { schemaVersion: 1, migrationId, createdAt: now, fromVersion,
      toVersion: STORAGE_SCHEMA_VERSION, originalValues, createdKeys, removals: [...new Set(removals)] };
    const backup = { ...backupPayload, checksum: checksum(backupPayload) };
    return { migrated: true, fromVersion, toVersion: STORAGE_SCHEMA_VERSION, updates, removals: [...new Set(removals)], backup, meta };
  }

  function validateStorageSnapshot(items, options) {
    const value = items && typeof items === "object" ? items : {};
    const settings = options && typeof options === "object" ? options : {};
    const errors = [];
    const version = currentVersion(value);
    if (settings.requireCurrent && version !== STORAGE_SCHEMA_VERSION) errors.push(`storage_version:${version}`);
    if (!value.ft_settings || typeof value.ft_settings !== "object") errors.push("missing_settings");
    Object.entries(value).forEach(([key, entry]) => {
      if (key.startsWith("ft_history_") && (!entry || typeof entry !== "object" || !Array.isArray(entry.followers) || !Array.isArray(entry.following))) errors.push(`invalid_history:${key}`);
      if (key.startsWith("ft_capture_meta_") && (!entry || typeof entry !== "object" || !entry.reports || typeof entry.reports !== "object")) errors.push(`invalid_capture_meta:${key}`);
    });
    return { ok: errors.length === 0, errors, version };
  }

  function validateBackup(backup) {
    if (!backup || typeof backup !== "object") return false;
    const payload = { schemaVersion: backup.schemaVersion, migrationId: backup.migrationId, createdAt: backup.createdAt,
      fromVersion: backup.fromVersion, toVersion: backup.toVersion, originalValues: backup.originalValues,
      createdKeys: backup.createdKeys, removals: backup.removals };
    return backup.checksum === checksum(payload);
  }

  async function restoreMigration(adapter, backupValue) {
    if (!adapter || typeof adapter.getAll !== "function" || typeof adapter.set !== "function" || typeof adapter.remove !== "function") {
      throw new TypeError("El adaptador de almacenamiento no es válido.");
    }
    const stored = backupValue ? null : await adapter.getAll();
    const backup = backupValue || stored && stored[MIGRATION_BACKUP_KEY];
    if (!validateBackup(backup)) throw new Error("El respaldo de migración no existe o está corrupto.");
    const originals = backup.originalValues && typeof backup.originalValues === "object" ? backup.originalValues : {};
    if (Object.keys(originals).length) await adapter.set(originals);
    const created = (Array.isArray(backup.createdKeys) ? backup.createdKeys : []).filter((key) => !Object.prototype.hasOwnProperty.call(originals, key));
    if (created.length) await adapter.remove(created);
    await adapter.set({ [MIGRATION_BACKUP_KEY]: { ...backup, restoredAt: new Date().toISOString() } });
    return { restored: true, migrationId: backup.migrationId, restoredKeys: Object.keys(originals), removedKeys: created };
  }

  async function migrateStorage(adapter, options) {
    if (!adapter || typeof adapter.getAll !== "function" || typeof adapter.set !== "function" || typeof adapter.remove !== "function") {
      throw new TypeError("El adaptador de almacenamiento no es válido.");
    }
    const before = await adapter.getAll();
    const plan = planStorageMigration(before, options);
    if (!plan.migrated) return plan;
    await adapter.set({ [MIGRATION_BACKUP_KEY]: plan.backup });
    try {
      if (Object.keys(plan.updates).length) await adapter.set(plan.updates);
      if (plan.removals.length) await adapter.remove(plan.removals);
      const interim = await adapter.getAll();
      const validation = validateStorageSnapshot({ ...interim, [STORAGE_META_KEY]: plan.meta }, { requireCurrent: true });
      if (!validation.ok) throw new Error(`La migración no superó la validación: ${validation.errors.join(", ")}`);
      await adapter.set({ [STORAGE_META_KEY]: plan.meta });
      return { ...plan, validation };
    } catch (error) {
      await restoreMigration(adapter, plan.backup);
      throw error;
    }
  }

  return { DEFAULT_SETTINGS, MIGRATION_BACKUP_KEY, STORAGE_META_KEY, STORAGE_SCHEMA_VERSION, checksum, currentVersion,
    migrateStorage, normalizeSettings, planStorageMigration, restoreMigration, validateBackup, validateStorageSnapshot };
});
