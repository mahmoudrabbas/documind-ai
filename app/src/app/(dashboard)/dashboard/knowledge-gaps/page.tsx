export default function KnowledgeGapsPage() {
  return (
    <main className="p-lg max-w-[1600px] mx-auto w-full flex-1">
      <div className="mb-xl mt-6">
        <h1 className="text-headline-lg font-bold text-primary">Knowledge Gaps</h1>
        <p className="mt-2 text-body-md text-on-surface-variant">Identify and resolve missing information across your knowledge base.</p>
      </div>
      
      <div className="bg-surface-container-lowest border border-outline-variant/30 rounded-3xl p-xl flex flex-col items-center justify-center min-h-[400px] shadow-sm">
        <div className="w-20 h-20 bg-error-container/50 rounded-full flex items-center justify-center mb-6">
          <span className="material-symbols-outlined text-[40px] text-error">troubleshoot</span>
        </div>
        <h2 className="text-title-lg font-bold text-primary mb-2">Knowledge Gaps Coming Soon</h2>
        <p className="text-body-md text-on-surface-variant max-w-md text-center">
          DocuMind AI will automatically identify frequently asked questions that cannot be answered by your current knowledge base.
        </p>
      </div>
    </main>
  );
}
