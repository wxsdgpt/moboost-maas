'use client';

// src/app/workflow/new/page.tsx
// 工作流编辑器页面 — 新建 or 从模板创建

import React from 'react';
import { useSearchParams } from 'next/navigation';
import WorkflowEditor from '@/components/workflow/WorkflowEditor';
import { getTemplateByKey } from '@/lib/workflowTemplates';
import type { WorkflowGraph } from '@/lib/workflowTypes';

export default function WorkflowNewPage() {
  const searchParams = useSearchParams();
  const templateKey = searchParams.get('template');

  const template = templateKey ? getTemplateByKey(templateKey) : null;
  const initialGraph: WorkflowGraph | undefined = template?.graph;
  const initialName = template ? template.name : undefined;

  const handleSave = async (graph: WorkflowGraph, name: string) => {
    // TODO: 调用 /api/workflows POST 创建
    console.log('Save workflow:', { name, graph });
  };

  const handleRun = async (graph: WorkflowGraph) => {
    // TODO: 调用 /api/workflows/[id]/estimate → 确认 → /api/workflows/[id]/run
    console.log('Run workflow:', graph);
  };

  return (
    <div className="h-screen">
      <WorkflowEditor
        initialGraph={initialGraph}
        workflowName={initialName}
        onSave={handleSave}
        onRun={handleRun}
      />
    </div>
  );
}
