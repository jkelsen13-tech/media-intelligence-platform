import { useMemo, useState } from 'react'

// Step 8 (§5): topic navigation entry point. Lists top-level topics;
// drilling into one shows its subtopics and focuses the graph on the
// nodes tagged with it (via node_topics). Only rendered when the topic
// tables exist (App feature-detects them; empty tables degrade to an
// "untagged" empty state).
export default function TopicBrowser({ topicsData, onSelectTopic, onClose }) {
  const [currentId, setCurrentId] = useState(null)

  const { topLevel, childrenByParent, memberCount, topicById } = useMemo(() => {
    const topics = topicsData?.topics ?? []
    const nodeTopics = topicsData?.nodeTopics ?? []
    const byId = new Map(topics.map((t) => [t.id, t]))
    const children = new Map()
    const top = []
    for (const t of topics) {
      if (t.parent_id && byId.has(t.parent_id)) {
        const arr = children.get(t.parent_id) ?? []
        arr.push(t)
        children.set(t.parent_id, arr)
      } else {
        top.push(t)
      }
    }
    // Direct member counts; a parent also inherits its children's members
    // so focusing a top-level topic covers the whole branch.
    const direct = new Map()
    for (const nt of nodeTopics) {
      direct.set(nt.topic_id, (direct.get(nt.topic_id) ?? 0) + 1)
    }
    const count = (t) => {
      let n = direct.get(t.id) ?? 0
      for (const c of children.get(t.id) ?? []) n += count(c)
      return n
    }
    const counts = new Map(topics.map((t) => [t.id, count(t)]))
    return { topLevel: top, childrenByParent: children, memberCount: counts, topicById: byId }
  }, [topicsData])

  // All node ids tagged with this topic or any descendant.
  const collectMembers = (topicId) => {
    const ids = new Set([topicId])
    const queue = [topicId]
    while (queue.length) {
      for (const c of childrenByParent.get(queue.pop()) ?? []) {
        if (!ids.has(c.id)) {
          ids.add(c.id)
          queue.push(c.id)
        }
      }
    }
    return (topicsData?.nodeTopics ?? [])
      .filter((nt) => ids.has(nt.topic_id))
      .map((nt) => nt.node_id)
  }

  const current = currentId ? topicById.get(currentId) : null
  const listing = current ? (childrenByParent.get(current.id) ?? []) : topLevel

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div
        className="sheet topic-browser"
        role="dialog"
        aria-label="Topics"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet-head">
          <h2>{current ? current.name : 'Topics'}</h2>
          <button className="sheet-close" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>
        {current && (
          <button type="button" className="topic-back" onClick={() => setCurrentId(null)}>
            ← All topics
          </button>
        )}
        {listing.length === 0 && (
          <p className="sheet-body muted">
            {current ? 'No subtopics.' : 'No topics defined yet.'}
          </p>
        )}
        <ul className="topic-list">
          {listing.map((t) => {
            const n = memberCount.get(t.id) ?? 0
            const hasChildren = (childrenByParent.get(t.id) ?? []).length > 0
            return (
              <li key={t.id} className="topic-item">
                {hasChildren ? (
                  <button type="button" className="topic-name" onClick={() => setCurrentId(t.id)}>
                    {t.name}
                    <span className="topic-count num">{n}</span>
                  </button>
                ) : (
                  <span className="topic-name topic-leaf">
                    {t.name}
                    <span className="topic-count num">{n}</span>
                  </span>
                )}
                <button
                  type="button"
                  className="topic-focus-btn"
                  disabled={n === 0}
                  title={n === 0 ? 'No nodes tagged with this topic yet' : 'Focus graph on this topic'}
                  onClick={() =>
                    onSelectTopic({ id: t.id, name: t.name, memberIds: collectMembers(t.id) })
                  }
                >
                  Focus
                </button>
              </li>
            )
          })}
        </ul>
        {current && (memberCount.get(current.id) ?? 0) > 0 && (
          <button
            type="button"
            className="sheet-done"
            onClick={() =>
              onSelectTopic({
                id: current.id,
                name: current.name,
                memberIds: collectMembers(current.id),
              })
            }
          >
            Focus graph on {current.name} (<span className="num">{memberCount.get(current.id)}</span>{' '}
            nodes)
          </button>
        )}
      </div>
    </div>
  )
}
