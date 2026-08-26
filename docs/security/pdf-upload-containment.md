# PDF upload containment

Nestory applies a local, fail-closed containment profile to user-uploaded PDFs.
This profile is not antivirus, a complete PDF sanitizer, or proof that a PDF is
safe from every viewer vulnerability. It reduces the accepted PDF grammar to
static evidence documents that the application can inspect predictably.

## Accepted grammar

- The file begins with a PDF 1.x or 2.x header at byte zero and ends with one
  terminal `startxref` / `%%EOF` sequence followed only by PDF whitespace.
- The final cross-reference section is either a classic xref table or a fully
  enumerated xref stream. Xref streams may be unfiltered, ASCIIHex, Flate, or
  ASCIIHex followed by Flate, without predictor parameters. Every type-1 entry
  must point to an ordinary indirect object with the declared object number and
  generation.
- Every in-use object is parsed from its declared xref offset. All references
  must resolve, overlapping object identifiers and duplicate dictionary keys
  are rejected, nesting/object counts and the document-total token count are
  bounded, and unclaimed body bytes may contain only whitespace or comments.
- Stream boundaries use a validated direct or ordinary indirect `/Length`.
  Accepted stream filters are unfiltered, ASCIIHex, Flate, ASCIIHex plus Flate,
  and DCT for image streams. Other filters or ambiguous filter definitions fail
  closed.
- Flate output is decoded with per-stream, document-total, and compression-ratio
  limits. DCT image streams must be structurally complete JPEGs whose SOF
  dimensions match their PDF dictionaries; images are limited to 40 million
  pixels each and 200 million pixels per document.

PDF names are decoded, including `#xx` escapes, before policy checks. Literal
strings, comments, and stream payloads are parsed or skipped according to the
grammar; they are not searched with raw substring rules.
Security-sensitive names are also resolved when stored as ordinary indirect
objects so separating an action dictionary from its action name cannot bypass
the policy.

## Rejected structures

- Incremental revisions (`/Prev`), hybrid xrefs (`/XRefStm`), encryption, xref
  entries for compressed objects, and `/ObjStm` object streams.
- Document-open or additional actions and action dictionaries, including
  JavaScript, Launch, URI/remote navigation, media, rendition, form submission,
  import/reset, PDF 2.0 actions, custom plug-in actions reached through an
  action-bearing `/A`, and related chained action types.
- Embedded or associated files (`/EmbeddedFiles`, `/Filespec`, `/EF`, `/AF`).
- External stream files/filters and reference XObjects (`/F`, `/FFilter`,
  `/FDecodeParms`, `/Ref` on stream dictionaries).
- Inline images in renderable content streams. Content streams are lexed after
  bounded outer-filter decoding, and a bare `BI` operator is rejected without
  interpreting string, comment, name, or binary payload bytes as operators.
  Predictor parameters (`/DecodeParms` or `/DP`) on those streams are rejected
  because containment does not implement their semantic transformation.
- RichMedia, 3D, movie, sound, screen, file-attachment, and widget annotations.
- Pass-through PostScript XObjects.
- AcroForm and XFA forms.
- Malformed offsets, object identities, references, lengths, trailers, excess
  expansion, xref entries outside trailer `/Size`, unsupported filters,
  prefix/trailing polyglot content, and other structural ambiguity.

Nestory-generated invoice, receipt, report, and owner-statement PDFs use the
accepted static classic-xref profile.

## Storage and delivery boundary

Uploads are size-checked before byte reads, PDF parsing, or image decoding and
are stored in private, size- and MIME-limited buckets. Ordinary evidence and
document downloads pass through an authenticated application route that
revalidates stored bytes and returns `Content-Disposition: attachment`, a
verified fixed `Content-Type`, `X-Content-Type-Options: nosniff`, and
`Cache-Control: private, no-store`. Private PDF/XLSX report attachments and
their error responses use the same cache and no-sniff policy.

## Residual risk

The validator does not detect malware encoded in otherwise permitted static
content, malicious fonts or images that satisfy these structural limits,
corrupt JPEG entropy that passes marker/dimension checks, unknown parser/viewer
vulnerabilities, or social-engineering content. Workflows that require malware
assurance should add an isolated, maintained scanning or content-disarm service
before publication; that operational control is not implemented here.
