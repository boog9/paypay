declare module "react-qr-code" {
  import type { FunctionComponent, SVGProps } from "react";

  interface QRCodeProps extends SVGProps<SVGSVGElement> {
    value: string;
    size?: number;
    bgColor?: string;
    fgColor?: string;
    level?: "L" | "M" | "Q" | "H";
    includeMargin?: boolean;
  }

  const QRCode: FunctionComponent<QRCodeProps>;

  export default QRCode;
}
