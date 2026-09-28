# Data credits

The calculator's code is under the MIT licence ([`LICENSE`](LICENSE)). Some of the data built into it comes from
others, credited here. Their terms, not the MIT licence, govern that data.

| data | where it is | source |
|---|---|---|
| Annual US stock returns, 1928 on (`HIST_RETURNS`, historical replay) | `src/engine.js` | Aswath Damodaran, NYU Stern School of Business, *Historical Returns on Stocks, Bonds and Bills* (S&P 500 with dividends), [pages.stern.nyu.edu/~adamodar](https://pages.stern.nyu.edu/~adamodar/). "S&P 500" is a trademark of S&P Dow Jones Indices LLC, which does not sponsor or endorse this project. |
| Annual US inflation, 1928 on (`HIST_INFLATION`) | `src/engine.js` | US Bureau of Labor Statistics, CPI-U, December to December (public domain); the match is documented in `Resource Documents/MARKET_DATA_CPI_U_MONTHLY_PACKAGE_2026.md` |
| Social Security cost-of-living adjustments (`HIST_COLA`) | `src/engine.js` | US Social Security Administration (public domain) |
| Cohort mortality tables, 2026 Trustees Report | `src/ported/ss-mortality-data.json` | US Social Security Administration, Office of the Chief Actuary (public domain) |
| 2026 tax rules, limits and premiums | `src/app-shell.html` (the rules package; each record carries its own link) | IRS, Social Security Administration, CMS, Arizona Department of Revenue (public domain) |

The private development repository also held a reconstructed dividend-index history for a dividend-fund projection.
It isn't included here, because its source's terms don't allow redistribution. That feature is left out of this
repository until the data is licensed or replaced.
