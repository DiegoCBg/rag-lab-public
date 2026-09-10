import ReactMarkdown from 'react-markdown'
import rehypeSanitize from 'rehype-sanitize'
import remarkGfm from 'remark-gfm'

const markdownComponents = {
  a: ({ node, ...props }) => (
    <a {...props} target="_blank" rel="noreferrer" />
  ),
  table: ({ node, ...props }) => (
    <div className="markdown-table-wrap">
      <table {...props} />
    </div>
  ),
}

export default function MarkdownContent({ children, className = '' }) {
  const source = typeof children === 'string' ? children : String(children || '')
  if (!source.trim()) return <span className={className}>—</span>

  return (
    <div className={`markdown-content ${className}`.trim()}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSanitize]}
        components={markdownComponents}
      >
        {source}
      </ReactMarkdown>
    </div>
  )
}
