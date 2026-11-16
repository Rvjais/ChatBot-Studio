import { CircleCheck, CircleX } from 'lucide-react';
import type { LastTest, TestProviderResult } from '../../../types/api';
import { formatMs, formatNumber, formatRelative } from '../../../utils/format';
import { cn } from '../../../utils/cn';

export function TestResultView({ result, unsaved }: { result: TestProviderResult; unsaved?: boolean }) {
  return (
    <div
      role="status"
      className={cn('rounded-lg px-4 py-3 text-sm ring-1 ring-inset', result.ok ? 'bg-emerald-50 ring-emerald-200' : 'bg-red-50 ring-red-200')}
    >
      <div className="flex items-start gap-2.5">
        {result.ok ? <CircleCheck size={18} className="mt-0.5 shrink-0 text-emerald-600" /> : <CircleX size={18} className="mt-0.5 shrink-0 text-red-600" />}
        <div className="min-w-0 flex-1">
          <p className={cn('font-medium', result.ok ? 'text-emerald-900' : 'text-red-900')}>
            {result.ok ? 'Connection successful' : 'Connection failed'}
            <span className="ml-2 font-normal text-zinc-500">{formatMs(result.latencyMs)}</span>
          </p>
          <p className={cn('mt-0.5 break-words', result.ok ? 'text-emerald-800' : 'text-red-800')}>{result.message}</p>
          {(result.model || result.sample || result.usage || result.dimensions) && (
            <dl className="mt-2 grid gap-x-6 gap-y-1 text-xs text-zinc-600 sm:grid-cols-2">
              {result.model && (
                <div>
                  <dt className="inline text-zinc-400">Model: </dt>
                  <dd className="inline font-mono">{result.model}</dd>
                </div>
              )}
              {result.dimensions && (
                <div>
                  <dt className="inline text-zinc-400">Dimensions: </dt>
                  <dd className="inline">{result.dimensions}</dd>
                </div>
              )}
              {result.usage && (
                <div>
                  <dt className="inline text-zinc-400">Tokens: </dt>
                  <dd className="inline">
                    {formatNumber(result.usage.inputTokens ?? 0)} in / {formatNumber(result.usage.outputTokens ?? 0)} out
                  </dd>
                </div>
              )}
              {result.sample && (
                <div className="sm:col-span-2">
                  <dt className="inline text-zinc-400">Reply: </dt>
                  <dd className="inline italic">“{result.sample}”</dd>
                </div>
              )}
            </dl>
          )}
          {unsaved && <p className="mt-2 text-xs text-zinc-500">Tested with your unsaved changes — save to keep them.</p>}
        </div>
      </div>
    </div>
  );
}

export function LastTestLine({ lastTest }: { lastTest: LastTest | null }) {
  if (!lastTest) return <p className="text-xs text-zinc-500">Not tested yet with the saved configuration.</p>;
  return (
    <p className="flex flex-wrap items-center gap-1.5 text-xs text-zinc-500">
      <span className={cn('inline-block h-1.5 w-1.5 rounded-full', lastTest.status === 'success' ? 'bg-emerald-500' : 'bg-red-500')} aria-hidden="true" />
      Last test {lastTest.status === 'success' ? 'succeeded' : 'failed'} {formatRelative(lastTest.testedAt)}
      {lastTest.latencyMs ? ` · ${formatMs(lastTest.latencyMs)}` : ''}
      {lastTest.status === 'failed' && lastTest.message && <span className="text-red-600">— {lastTest.message}</span>}
    </p>
  );
}
