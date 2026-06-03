# Browser Compatibility Differences

> Updated: 2026-06-03 | Chrome 88+ / Firefox 128+

## Build Status

| Browser | Manifest | Build | Size |
|---------|----------|:-----:|-----:|
| Chrome | MV3 | ✅ | 250.31 KB |
| Firefox | MV2 | ✅ | 250.29 KB |

## Known Differences

| # | Feature | Chrome | Firefox | Impact | Status |
|---|---------|--------|---------|--------|--------|
| 1 | `chrome.storage.session` | ✅ MV3 native | ⚠️ v128+ | Cache rebuild after SW restart | Runtime detect + fallback to local |
| 2 | `getBytesInUse()` | ✅ | ⚠️ May not exist | Capacity guard in write-through | Wrapped in try/catch |
| 3 | Popup entry | `browser_action` | `browser_action` | Identical | ✅ WXT unified |
| 4 | Options page | `options_ui` | `options_ui` | Identical | ✅ WXT unified |
| 5 | `contextMenus` | ✅ | ✅ | Right-click "翻译选中文字" | ✅ Tested |
| 6 | `commands` (Alt+T) | ✅ | ✅ | Shortcut toggle | ✅ Manifest unified |
| 7 | Service Worker fetch | Relaxed CORS | Stricter | API calls to engines | ✅ host_permissions declared |
| 8 | `data_collection_permissions` | N/A | Required for new extensions | Must attest no data collection | ✅ `suppressWarnings: true` |
| 9 | Popup layout | Standard | Standard | Width/height identical | ✅ |

## Weekly Check

- [x] Chrome build passes
- [x] Firefox build passes
- [x] TypeScript zero errors
- [x] ESLint zero errors
- [x] 45 unit tests pass

## Change Log

- 2026-06-03 15:25: Firefox build confirmed. No runtime API differences found. `suppressWarnings.firefoxDataCollection` set.
- 2026-06-03 12:54: Initial scaffold. WXT handles basic Manifest differences.
