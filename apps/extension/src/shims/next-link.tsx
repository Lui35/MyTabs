import * as React from "react";

type LinkProps = React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string };

const Link = React.forwardRef<HTMLAnchorElement, LinkProps>(function Link(
  { href, onClick, ...props },
  ref,
) {
  return (
    <a
      {...props}
      ref={ref}
      href={href}
      onClick={(event) => {
        onClick?.(event);
        if (event.defaultPrevented) return;
        event.preventDefault();
        window.dispatchEvent(new CustomEvent("tabs:navigate", { detail: href }));
      }}
    />
  );
});

export default Link;
