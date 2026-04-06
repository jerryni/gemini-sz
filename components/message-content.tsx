"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type Props = {
  content: string;
};

export function MessageContent({ content }: Props) {
  return (
    <div className="assistant-markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a({ node: _node, ...props }) {
            return <a {...props} rel="noreferrer" target="_blank" />;
          },
          code({ className, children, ...props }) {
            const isBlock = className?.includes("language-");

            if (!isBlock) {
              return (
                <code className="inline-code" {...props}>
                  {children}
                </code>
              );
            }

            return (
              <code className={className} {...props}>
                {children}
              </code>
            );
          },
          pre({ children, ...props }) {
            return (
              <pre className="code-block" {...props}>
                {children}
              </pre>
            );
          },
          table({ children, ...props }) {
            return (
              <div className="table-wrap">
                <table {...props}>{children}</table>
              </div>
            );
          }
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
