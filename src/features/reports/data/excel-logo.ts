import { strFromU8, strToU8 } from "fflate";

// The logo is normalized to JPEG by the private organization-assets loader.
export function addCompanyLogo(
  files: Record<string, Uint8Array>,
  logo: { bytes: Uint8Array; width: number; height: number },
  region?: { column: number; width: number; height: number },
) {
  if (!(logo.width > 0 && logo.height > 0 && Number.isFinite(logo.width) && Number.isFinite(logo.height))) {
    throw new Error("Company logo dimensions are invalid.");
  }
  files["[Content_Types].xml"] = strToU8(strFromU8(files["[Content_Types].xml"]).replace("</Types>", '<Default Extension="jpg" ContentType="image/jpeg"/><Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/></Types>'));
  files["xl/media/company-logo.jpg"] = logo.bytes;
  const relationships = (type: string, target: string) => strToU8(`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/${type}" Target="${target}"/></Relationships>`);
  files["xl/worksheets/_rels/sheet1.xml.rels"] = relationships("drawing", "../drawings/drawing1.xml");
  files["xl/drawings/_rels/drawing1.xml.rels"] = relationships("image", "../media/company-logo.jpg");
  const scale = Math.min((region?.width ?? 230) / logo.width, (region?.height ?? 76) / logo.height);
  const cx = Math.round(logo.width * scale * 9525);
  const cy = Math.round(logo.height * scale * 9525);
  const columnOffset = region ? Math.round((region.width * 9525 - cx) / 2) : 0;
  const rowOffset = region ? Math.round((8 + (region.height - logo.height * scale) / 2) * 9525) : 0;
  files["xl/drawings/drawing1.xml"] = strToU8(`<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><xdr:oneCellAnchor><xdr:from><xdr:col>${region?.column ?? 5}</xdr:col><xdr:colOff>${columnOffset}</xdr:colOff><xdr:row>1</xdr:row><xdr:rowOff>${rowOffset}</xdr:rowOff></xdr:from><xdr:ext cx="${cx}" cy="${cy}"/><xdr:pic><xdr:nvPicPr><xdr:cNvPr id="1" name="Company logo"/><xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr><xdr:blipFill><a:blip xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:embed="rId1"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill><xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic><xdr:clientData/></xdr:oneCellAnchor></xdr:wsDr>`);
}
