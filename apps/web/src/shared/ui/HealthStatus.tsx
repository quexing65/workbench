import { useQuery } from '@tanstack/react-query';
import { getHealth } from '../api/health';

export function HealthStatus() {
  const health = useQuery({
    queryKey: ['health'],
    queryFn: ({ signal }) => getHealth(signal),
  });

  if (health.isPending) {
    return (
      <div className="health health--pending" role="status">
        <span className="health__dot" aria-hidden="true" />
        正在连接本机服务
      </div>
    );
  }

  if (health.isError) {
    return (
      <div className="health health--error" role="alert">
        <span className="health__dot" aria-hidden="true" />
        <span>本机服务未连接</span>
        <button className="health__retry" type="button" onClick={() => health.refetch()}>
          重试
        </button>
      </div>
    );
  }

  return (
    <div className="health health--ok" role="status">
      <span className="health__dot" aria-hidden="true" />
      <span>本机服务正常</span>
      <span className="health__version" aria-label={`版本 ${health.data.version}`}>
        v{health.data.version}
      </span>
    </div>
  );
}
