import { APP_NAME } from '../config/brand';
import { LogoIcon } from './icons';

interface BrandMarkProps {
  showName?: boolean;
}

/** The product logo mark, optionally followed by the product name. */
export function BrandMark({ showName = true }: BrandMarkProps) {
  return (
    <>
      <span className="brand__mark">
        <LogoIcon />
      </span>
      {showName && <span className="brand__name">{APP_NAME}</span>}
    </>
  );
}
