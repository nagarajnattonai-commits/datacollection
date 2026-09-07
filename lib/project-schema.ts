import type {
  FlexibleMetadata,
  IntakeField,
  ProjectConfig,
} from './workflow.ts';
import { WorkflowError } from './workflow.ts';

const cache = new Map<string, { expires: number; value: ProjectConfig }>();

export async function cachedProjectSchema(
  projectId: string,
  loader: () => Promise<ProjectConfig>,
  now = Date.now(),
) {
  const cached = cache.get(projectId);
  if (cached && cached.expires > now) return structuredClone(cached.value);
  const value = await loader();
  cache.set(projectId, {
    expires: now + 30_000,
    value: structuredClone(value),
  });
  if (cache.size > 100)
    for (const [key, entry] of cache)
      if (entry.expires <= now) cache.delete(key);
  return value;
}

export function clearProjectSchemaCache(projectId?: string) {
  if (projectId) cache.delete(projectId);
  else cache.clear();
}

export function validateIntakeAnswers(
  fields: IntakeField[],
  value: unknown,
): FlexibleMetadata {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new WorkflowError('Complete the project questions.', 400);
  const supplied = value as Record<string, unknown>;
  const result: FlexibleMetadata = {};
  for (const field of fields) {
    const answer = supplied[field.id];
    if (field.type === 'checkbox') {
      if (typeof answer !== 'boolean')
        throw new WorkflowError(`Complete “${field.label}”.`, 400);
      if (field.required && !answer)
        throw new WorkflowError(`Confirm “${field.label}”.`, 400);
      result[field.id] = answer;
      continue;
    }
    const text = typeof answer === 'string' ? answer.trim() : '';
    if (field.required && !text)
      throw new WorkflowError(`Complete “${field.label}”.`, 400);
    if (!text) continue;
    if (text.length > Math.min(field.maxLength ?? 500, 2_000))
      throw new WorkflowError(`“${field.label}” is too long.`, 400);
    if (
      (field.type === 'select' || field.type === 'radio') &&
      !field.options?.some((option) => option.value === text)
    )
      throw new WorkflowError(`Choose a valid “${field.label}” option.`, 400);
    if (field.type === 'number' && !Number.isFinite(Number(text)))
      throw new WorkflowError(`Enter a number for “${field.label}”.`, 400);
    result[field.id] = text;
  }
  return result;
}

export function validateProjectConfig(value: unknown): ProjectConfig {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new WorkflowError('Project configuration is invalid.', 400);
  const config = value as ProjectConfig;
  if (
    !/^[A-Za-z0-9_-]{1,64}$/.test(config.id) ||
    !config.name?.trim() ||
    !config.language?.trim() ||
    !config.locale?.trim() ||
    !Array.isArray(config.technical?.formats) ||
    config.technical.minDurationSeconds < 1 ||
    config.technical.maxDurationSeconds <=
      config.technical.minDurationSeconds ||
    config.technical.maxDurationSeconds > 3_600 ||
    config.technical.maxBytes < 1_024 ||
    config.technical.maxBytes > 500 * 1024 * 1024 ||
    !Array.isArray(config.intakeFields) ||
    config.intakeFields.length > 30
  )
    throw new WorkflowError('Project configuration is invalid.', 400);
  const ids = new Set<string>();
  for (const field of config.intakeFields) {
    if (
      !/^[a-z][a-z0-9_]{0,63}$/.test(field.id) ||
      ids.has(field.id) ||
      !field.label?.trim() ||
      !['text', 'textarea', 'select', 'radio', 'checkbox', 'number'].includes(
        field.type,
      )
    )
      throw new WorkflowError('A project intake field is invalid.', 400);
    ids.add(field.id);
  }
  return structuredClone(config);
}
