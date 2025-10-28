import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Link, Copy, Check, ChevronDown, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface AffiliateLinkDropdownProps {
  clickupTaskId: string;
  subIdValue: string;
}

// Helper to decode HTML entities
function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

// Common affiliate tracking parameter names (comprehensive list)
const affiliateParams = [
  // Primary tracking params
  'payload', 'subid', 'sub_id', 'clickid', 'click_id', 'clickID',
  // Campaign params
  'campaign', 'campaign_id', 'affid', 'aff_id',
  // Additional tracking params
  'tracking', 'tracker', 'ref', 'reference', 'source',
  // UTM params
  'utm_campaign', 'utm_source', 'utm_medium', 'utm_term', 'utm_content',
  // Miscellaneous
  'pid', 'aid', 'sid', 'cid', 'tid', 'btag', 'tag', 'var',
  'raw', 'nci', 'nkw', 'lpid', 'bid', 'b', 'a', 's', 'dyn_id'
];

function findTrackingParam(url: string): { param: string; value: string } | null {
  if (!url) return null;
  
  // Decode HTML entities first
  url = decodeHtmlEntities(url);
  
  try {
    const urlObj = new URL(url);
    
    // First pass: exact case-sensitive match
    for (const param of affiliateParams) {
      const value = urlObj.searchParams.get(param);
      if (value) {
        return { param, value };
      }
    }
    
    // Second pass: case-insensitive match for params like clickID vs clickid
    const allParams = Array.from(urlObj.searchParams.keys());
    for (const actualParam of allParams) {
      for (const knownParam of affiliateParams) {
        if (actualParam.toLowerCase() === knownParam.toLowerCase()) {
          const value = urlObj.searchParams.get(actualParam);
          if (value) {
            return { param: actualParam, value };
          }
        }
      }
    }
  } catch (e) {
    // Parsing failed, fall through to regex
  }
  
  // Fallback for malformed URLs or when no param was found - use regex
  for (const param of affiliateParams) {
    const match = url.match(new RegExp(`(${param})=([^&\\s]+)`, 'i'));
    if (match) {
      return { param: match[1], value: match[2] };
    }
  }
  
  return null;
}

function safeGetPayload(url: string): string | null {
  const tracking = findTrackingParam(url);
  return tracking ? tracking.value : null;
}

function safeReplacePayload(url: string, newPayload: string): string {
  // Decode HTML entities first
  url = decodeHtmlEntities(url);
  
  const tracking = findTrackingParam(url);
  if (!tracking) return url;
  
  try {
    const urlObj = new URL(url);
    urlObj.searchParams.set(tracking.param, newPayload);
    return urlObj.toString();
  } catch (e) {
    // Fallback for malformed/relative URLs - use regex
    return url.replace(
      new RegExp(`${tracking.param}=[^&\\s]+`, 'i'), 
      `${tracking.param}=${newPayload}`
    );
  }
}

export function AffiliateLinkDropdown({ clickupTaskId, subIdValue }: AffiliateLinkDropdownProps) {
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const { toast } = useToast();

  const { data, isLoading, error } = useQuery<{ links: Array<{url: string, brand: string, position: string}> }>({
    queryKey: ['/api/clickup/task', clickupTaskId, 'affiliate-links'],
    enabled: !!clickupTaskId && isOpen,
  });

  const affiliateLinks = data?.links || [];

  const handleCopyLink = async (originalUrl: string) => {
    try {
      const modifiedUrl = safeReplacePayload(originalUrl, subIdValue);
      await navigator.clipboard.writeText(modifiedUrl);
      setCopiedUrl(originalUrl);
      toast({
        title: "Link copied!",
        description: "Affiliate link with your Sub-ID has been copied to clipboard.",
      });
      setTimeout(() => setCopiedUrl(null), 2000);
    } catch (e) {
      toast({
        title: "Copy failed",
        description: "Could not copy link to clipboard. Please try again.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="mt-2">
      <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            data-testid="button-affiliate-links"
          >
            <Link className="h-3 w-3 mr-1.5" />
            Affiliate Links
            <ChevronDown className="h-3 w-3 ml-1.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-[800px] max-h-[500px] overflow-y-auto affiliate-links-scrollbar">
          {isLoading ? (
            <div className="px-2 py-3 text-xs text-muted-foreground text-center">
              Loading links...
            </div>
          ) : error ? (
            <div className="px-2 py-3 text-xs text-destructive flex items-center gap-2 justify-center">
              <AlertCircle className="h-3.5 w-3.5" />
              Failed to load affiliate links
            </div>
          ) : affiliateLinks.length === 0 ? (
            <div className="px-2 py-3 text-xs text-muted-foreground text-center">
              No affiliate links found in task
            </div>
          ) : (
            <>
              <div className="px-3 py-2 text-xs font-semibold text-muted-foreground border-b sticky top-0 bg-popover">
                {affiliateLinks.length} Affiliate Link{affiliateLinks.length !== 1 ? 's' : ''} - Click to copy with your Sub-ID
              </div>
              {affiliateLinks.map((linkData, index) => {
                const link = linkData.url;
                const modifiedLink = safeReplacePayload(link, subIdValue);
                const originalPayload = safeGetPayload(link);
                const isCopied = copiedUrl === link;
                const displayNumber = linkData.position || (index + 1).toString();
                
                return (
                  <DropdownMenuItem
                    key={index}
                    onClick={() => handleCopyLink(link)}
                    className="flex items-start gap-3 py-3 px-3 cursor-pointer border-b last:border-b-0 hover:bg-accent/50"
                    data-testid={`menuitem-affiliate-link-${index}`}
                  >
                    <div className="flex items-start gap-3 flex-1">
                      <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center border border-primary/20">
                        <span className="text-sm font-bold text-primary">{displayNumber}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        {linkData.brand && (
                          <div className="text-sm font-bold text-foreground mb-1.5">
                            {linkData.brand}
                          </div>
                        )}
                        <div className="text-xs font-mono break-all text-muted-foreground leading-relaxed">
                          {modifiedLink}
                        </div>
                        {originalPayload && (
                          <div className="text-xs text-muted-foreground mt-1.5 font-medium opacity-70">
                            Original: {originalPayload}
                          </div>
                        )}
                      </div>
                    </div>
                    {isCopied ? (
                      <Check className="h-4 w-4 text-primary flex-shrink-0 mt-1" />
                    ) : (
                      <Copy className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-1" />
                    )}
                  </DropdownMenuItem>
                );
              })}
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
