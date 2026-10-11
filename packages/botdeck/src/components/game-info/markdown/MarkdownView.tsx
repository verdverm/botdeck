import Markdown from "react-markdown";

/**
 * Render markdown as styled HTML. Kept intentionally minimal: the prompt/
 * goals/memory/journal docs are simple (headings, lists, code, bold/italic), so
 * we map the few elements react-markdown emits to Tailwind classes rather than
 * pulling in a typography plugin. No `rehype-raw`, so embedded HTML stays
 * inert (escaped as text) — prompts are untrusted-ish content and we never
 * want raw HTML injection into the dashboard.
 */
export function MarkdownView({ content }: { content: string }) {
  return (
    <div className="text-xs leading-relaxed text-neutral-300 [&_a]:text-sky-400 [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:border-neutral-600 [&_blockquote]:pl-2 [&_blockquote]:text-neutral-400 [&_code]:rounded [&_code]:bg-neutral-900 [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-amber-300 [&_h1]:mb-1 [&_h1]:text-base [&_h1]:font-semibold [&_h1]:text-neutral-100 [&_h2]:mb-1 [&_h2]:mt-2 [&_h2]:text-sm [&_h2]:font-semibold [&_h2]:text-neutral-100 [&_h3]:mt-2 [&_h3]:text-xs [&_h3]:font-semibold [&_h3]:text-neutral-100 [&_li]:ml-4 [&_ol]:list-decimal [&_ol]:pl-4 [&_p]:my-1 [&_pre]:my-1 [&_pre]:overflow-auto [&_pre]:rounded [&_pre]:bg-neutral-950 [&_pre]:p-2 [&_pre_code]:bg-transparent [&_pre_code]:px-0 [&_ul]:list-disc [&_ul]:pl-4">
      <Markdown>{content}</Markdown>
    </div>
  );
}
