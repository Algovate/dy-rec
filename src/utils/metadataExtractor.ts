/**
 * Metadata extraction utilities for browser pages
 */

export interface PageMetadata {
  anchorName: string;
  title: string;
}

/**
 * CSS selectors for anchor name extraction (in priority order)
 */
const ANCHOR_SELECTORS = [
  '[data-e2e="live-room-anchor-name"]',
  '.live-room-anchor-name',
  '.anchor-name',
  '.nickname',
  'h1',
  'h2',
  '.room-title',
  '[class*="anchor"]',
  '[class*="nickname"]',
] as const;

/**
 * CSS selectors for title extraction (in priority order)
 */
const TITLE_SELECTORS = [
  '[data-e2e="live-room-title"]',
  '.live-room-title',
  '.room-title',
  '[class*="title"]',
  '.subtitle',
] as const;


/**
 * Extract metadata from DOM and page data
 * This function is injected into the browser page context
 */
export function extractMetadataScript(): string {
  return `
    (function() {
      const result = {
        anchorName: '',
        title: ''
      };

      // Extract anchor name
      const anchorSelectors = ${JSON.stringify(ANCHOR_SELECTORS)};
      for (const selector of anchorSelectors) {
        const element = document.querySelector(selector);
        if (element) {
          const text = element.textContent?.trim();
          if (text && text.length > 0 && text.length < 50) {
            result.anchorName = text;
            break;
          }
        }
      }

      // Extract from page title if not found
      if (!result.anchorName) {
        const pageTitle = document.title;
        if (pageTitle) {
          const match = pageTitle.match(/^(.+?)\\s*[-|–|—]\\s*抖音/);
          if (match && match[1]) {
            result.anchorName = match[1].trim();
          } else {
            result.anchorName = pageTitle.split(' - ')[0] || pageTitle.split(' | ')[0] || '';
          }
        }
      }

      // Extract title
      const titleSelectors = ${JSON.stringify(TITLE_SELECTORS)};
      for (const selector of titleSelectors) {
        const element = document.querySelector(selector);
        if (element) {
          const text = element.textContent?.trim();
          if (text && text.length > 0 && text.length < 200) {
            result.title = text;
            break;
          }
        }
      }

      // Try meta tags
      if (!result.title) {
        const metaTitle = document.querySelector('meta[property="og:title"]');
        if (metaTitle) {
          const content = metaTitle.getAttribute('content');
          if (content) {
            result.title = content;
          }
        }
      }

      // Try page data objects
      try {
        const pageData = window.__INITIAL_STATE__ || window.__NUXT__;
        if (pageData) {
          if (!result.anchorName) {
            const anchor = pageData?.data?.user?.nickname ||
                          pageData?.anchor?.nickname ||
                          pageData?.userInfo?.nickname;
            if (anchor) result.anchorName = anchor;
          }
          if (!result.title) {
            const title = pageData?.data?.room?.title ||
                         pageData?.room?.title ||
                         pageData?.roomInfo?.title;
            if (title) result.title = title;
          }
        }
      } catch (e) {
        // Ignore errors
      }

      return result;
    })();
  `;
}

/**
 * Extract metadata using browser evaluation
 */
export async function extractMetadata(page: { evaluate: (fn: any, ...args: any[]) => Promise<PageMetadata> }): Promise<PageMetadata> {
  try {
    const metadata = await page.evaluate(
      (args: { anchorSelectors: string[]; titleSelectors: string[] }) => {
        const result: PageMetadata = {
          anchorName: '',
          title: '',
        };

        // Extract anchor name
        for (const selector of args.anchorSelectors) {
          const element = document.querySelector(selector);
          if (element) {
            const text = element.textContent?.trim();
            if (text && text.length > 0 && text.length < 50) {
              result.anchorName = text;
              break;
            }
          }
        }

        // Extract from page title if not found
        if (!result.anchorName) {
          const pageTitle = document.title;
          if (pageTitle) {
            const match = pageTitle.match(/^(.+?)\s*[-|–|—]\s*抖音/);
            if (match && match[1]) {
              result.anchorName = match[1].trim();
            } else {
              result.anchorName = pageTitle.split(' - ')[0] || pageTitle.split(' | ')[0] || '';
            }
          }
        }

        // Extract title
        for (const selector of args.titleSelectors) {
          const element = document.querySelector(selector);
          if (element) {
            const text = element.textContent?.trim();
            if (text && text.length > 0 && text.length < 200) {
              result.title = text;
              break;
            }
          }
        }

        // Try meta tags
        if (!result.title) {
          const metaTitle = document.querySelector('meta[property="og:title"]');
          if (metaTitle) {
            const content = metaTitle.getAttribute('content');
            if (content) {
              result.title = content;
            }
          }
        }

        // Try page data objects
        try {
          const pageData = (window as any).__INITIAL_STATE__ || (window as any).__NUXT__;
          if (pageData) {
            if (!result.anchorName) {
              const anchor =
                pageData?.data?.user?.nickname ||
                pageData?.anchor?.nickname ||
                pageData?.userInfo?.nickname;
              if (anchor) result.anchorName = anchor;
            }
            if (!result.title) {
              const title =
                pageData?.data?.room?.title ||
                pageData?.room?.title ||
                pageData?.roomInfo?.title;
              if (title) result.title = title;
            }
          }
        } catch {
          // Ignore errors
        }

        return result;
      },
      { anchorSelectors: Array.from(ANCHOR_SELECTORS), titleSelectors: Array.from(TITLE_SELECTORS) }
    );

    return metadata;
  } catch (error: any) {
    console.log(`[Metadata Extractor] Failed to extract metadata: ${error.message}`);
    return { anchorName: '', title: '' };
  }
}

