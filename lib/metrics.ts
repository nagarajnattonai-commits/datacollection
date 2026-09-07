import type { State, Status } from './workflow.ts';

export function workspaceMetrics(state: State, now = Date.now()) {
  const statusCounts = Object.fromEntries(
    (
      [
        'PROCESSING',
        'QUICK_REVIEW',
        'REJECTED',
        'STT_PENDING',
        'STT_PROCESSING',
        'STT_FAILED',
        'DEEP_REVIEW',
        'READY_TO_DELIVER',
      ] satisfies Status[]
    ).map((status) => [
      status,
      state.tasks.filter((task) => task.status === status).length,
    ]),
  ) as Record<Status, number>;
  const openRound = state.rounds.find((round) => round.status === 'open');
  const activeClaims = state.tasks.filter(
    (task) => (task.claim?.expires ?? 0) > now,
  ).length;
  const expiredClaims = state.tasks.filter(
    (task) => task.claim && task.claim.expires <= now,
  ).length;
  const roundReviewed = openRound
    ? openRound.taskIds.filter((id) =>
        state.tasks
          .find((task) => task.id === id)
          ?.reviews.some((review) => review.round === openRound.number),
      ).length
    : 0;
  return {
    generatedAt: new Date(now).toISOString(),
    project: {
      name: state.config.name,
      language: state.config.language,
      locale: state.config.locale,
      transcriptionProvider: state.config.provider,
    },
    team: {
      total: state.members.length,
      contributors: state.members.filter(
        (member) => member.role === 'contributor',
      ).length,
      reviewers: state.members.filter((member) => member.role === 'qa').length,
      teamLeaders: state.members.filter(
        (member) => member.role === 'team_leader',
      ).length,
      administrators: state.members.filter((member) => member.role === 'admin')
        .length,
    },
    tasks: {
      total: state.tasks.length,
      byStatus: statusCounts,
      activeClaims,
      expiredClaims,
      transcriptionBacklog:
        statusCounts.STT_PENDING + statusCounts.STT_PROCESSING,
      postProcessingQueue: statusCounts.PROCESSING,
      failedTranscriptions: statusCounts.STT_FAILED,
      readyToDeliver: statusCounts.READY_TO_DELIVER,
    },
    uploads: {
      active: state.uploads.filter((upload) => upload.expires > now).length,
      success: state.uploadMetrics.completed,
      failed: state.uploadMetrics.failed,
      averageMilliseconds: state.uploadMetrics.completed
        ? Math.round(
            state.uploadMetrics.totalUploadMilliseconds /
              state.uploadMetrics.completed,
          )
        : 0,
    },
    round: openRound
      ? {
          number: openRound.number,
          eligible: openRound.taskIds.length,
          reviewed: roundReviewed,
          remaining: openRound.taskIds.length - roundReviewed,
        }
      : null,
  };
}
