export type SiteId = string
export type ArticleStatus =
  | 'pending'
  | 'brief'
  | 'writing'
  | 'images'
  | 'publishing'
  | 'published'
  | 'failed'

export type OpportunityType =
  | 'new_article'
  | 'upgrade_article'
  | 'ctr_improvement'
  | 'internal_links'
  | 'declining_page'

export type OpportunityStatus = 'pending' | 'in_progress' | 'done' | 'skipped'
