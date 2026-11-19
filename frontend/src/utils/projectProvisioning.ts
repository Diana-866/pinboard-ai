import { getAppErrorMessage } from '../i18n/appErrorCopy';

type ProjectRecord = { id?: unknown } | null | undefined;

type LoadProjects = () => Promise<unknown>;
type CreateProject = () => Promise<unknown>;

const inFlightProjectProvisioning = new Map<string, Promise<{ id: string }>>();

/**
 * Ensures one project is provisioned per user within this browser runtime.
 * Concurrent board-create flows share the same read/create operation.
 * If a response is lost after the server commits, the next attempt reads
 * the persisted project before considering another create.
 */
export function getOrCreateProject(
  userId: string,
  loadProjects: LoadProjects,
  createProject: CreateProject,
): Promise<{ id: string }> {
  const ownerId = String(userId || '').trim();
  if (!ownerId) return Promise.reject(new Error(getAppErrorMessage('userNotIdentified')));

  const existing = inFlightProjectProvisioning.get(ownerId);
  if (existing) return existing;

  const operation = (async () => {
    const projects = await loadProjects();
    if (!Array.isArray(projects)) {
      throw new Error(getAppErrorMessage('projectsListInvalid'));
    }

    let project: ProjectRecord;
    if (projects.length > 0) {
      project = projects[0] as ProjectRecord;
    } else {
      project = await createProject() as ProjectRecord;
    }

    const id = project && typeof project === 'object' && project.id != null
      ? String(project.id).trim()
      : '';
    if (!id) {
      throw new Error(getAppErrorMessage('projectNotConfirmed'));
    }
    return { id };
  })();

  inFlightProjectProvisioning.set(ownerId, operation);
  void operation.finally(() => {
    if (inFlightProjectProvisioning.get(ownerId) === operation) {
      inFlightProjectProvisioning.delete(ownerId);
    }
  }).catch(() => {
    // The original promise is returned to callers; this handler prevents
    // the cleanup chain from becoming an unhandled rejection.
  });

  return operation;
}
