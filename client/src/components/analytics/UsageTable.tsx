import { providerLabel } from '../../hooks/useProviders';
import type { ProviderUsage } from '../../types/api';
import { formatCompact, formatCost, formatMs, formatNumber } from '../../utils/format';
import { TBody, TD, TH, THead, TR, Table } from '../ui/Table';

/**
 * Provider/model usage. Cost shows "—" when no message had pricing data (never estimated).
 * `compact` fits half-width cards (tokens combined, no latency/errors columns).
 */
export function UsageTable({ rows, compact }: { rows: ProviderUsage[]; compact?: boolean }) {
  if (!rows.length) {
    return <p className="px-5 py-8 text-center text-sm text-zinc-500">No AI usage recorded in this period.</p>;
  }
  if (compact) {
    return (
      <Table minWidth={420}>
        <THead>
          <tr>
            <TH>Provider / model</TH>
            <TH className="text-right">Answers</TH>
            <TH className="text-right">Tokens in / out</TH>
            <TH className="text-right">Cost</TH>
          </tr>
        </THead>
        <TBody>
          {rows.map((r) => (
            <TR key={`${r.provider}:${r.model}`}>
              <TD className="max-w-[200px]">
                <p className="font-medium text-zinc-900">{providerLabel(r.provider)}</p>
                <p className="truncate font-mono text-xs text-zinc-500" title={r.model}>
                  {r.model}
                </p>
              </TD>
              <TD className="tabular text-right">
                {formatNumber(r.messages)}
                {r.errors > 0 && <span className="block text-[11px] text-red-600">{formatNumber(r.errors)} failed</span>}
              </TD>
              <TD className="tabular text-right whitespace-nowrap">
                {formatCompact(r.inputTokens)} / {formatCompact(r.outputTokens)}
              </TD>
              <TD className="tabular text-right" title={r.costUsd === null ? 'No pricing data for this model' : undefined}>
                {formatCost(r.costUsd)}
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>
    );
  }
  return (
    <Table minWidth={760}>
      <THead>
        <tr>
          <TH>Provider / model</TH>
          <TH className="text-right">Answers</TH>
          <TH className="text-right">Errors</TH>
          <TH className="text-right">Input tokens</TH>
          <TH className="text-right">Output tokens</TH>
          <TH className="text-right">Cost (USD)</TH>
          <TH className="text-right">Avg latency</TH>
        </tr>
      </THead>
      <TBody>
        {rows.map((r) => (
          <TR key={`${r.provider}:${r.model}`}>
            <TD>
              <p className="font-medium text-zinc-900">{providerLabel(r.provider)}</p>
              <p className="font-mono text-xs text-zinc-500">{r.model}</p>
            </TD>
            <TD className="tabular text-right">{formatNumber(r.messages)}</TD>
            <TD className={r.errors ? 'tabular text-right text-red-600' : 'tabular text-right'}>{formatNumber(r.errors)}</TD>
            <TD className="tabular text-right">{formatNumber(r.inputTokens)}</TD>
            <TD className="tabular text-right">{formatNumber(r.outputTokens)}</TD>
            <TD className="tabular text-right" title={r.costUsd === null ? 'No pricing data for this model' : `${r.messagesWithCost} of ${r.messages} answers priced`}>
              {formatCost(r.costUsd)}
            </TD>
            <TD className="tabular text-right">{formatMs(r.avgLatencyMs)}</TD>
          </TR>
        ))}
      </TBody>
    </Table>
  );
}
