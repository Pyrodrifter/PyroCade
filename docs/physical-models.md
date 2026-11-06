# Physical media references

The renderer uses original CSS/SVG geometry, with closed perimeter walls, beveled
caps, separate molding and label surfaces. No downloaded mesh, CAD file, texture
or reference photograph is bundled. Existing user artwork still supplies labels.
The shell aspect ratios and thickness ratios follow the dimensions below. Each
system is enlarged independently for readability in the case viewer; these are
visual models, not manufacturing CAD.

## Dimensions used

Width × height × depth, in millimetres. Rounded/community figures are not factory
tolerances. Most come from the contributor measurements in
[ConsoleMods' cartridge dimension table](https://consolemods.org/wiki/Dimensions_for_Game_Cartridges).

| Shell | W × H × D | Notes |
| --- | --- | --- |
| NES | 120 × 134 × 17 | Standard Western shell; three-screw rear layout |
| SNES | 135.85 × 87.7 × 19.7 | North American shell, matching the supplied photo |
| Game Boy | 57 × 65 × 7.8 | Notched upper right corner |
| Game Boy Color | 57 × 65.5 × 9 | Curved Color-only shell |
| Game Boy Advance | 60 × 35 × 8 | Maximum grip width; body is narrower |
| Nintendo 64 | 116 × 76.6 × 18.5 | Standard shell |
| Genesis | 109 × 70 × 17 | Standard Western shell; flat crown, rounded sides |
| Atari 2600 | 82 × 98 × 20 | Standard Atari shell |
| DS | 33 × 35 × 3.8 | Clipped upper corner |
| 3DS | 35 × 35 × 3.8 | Approximate envelope including the upper tab |
| Switch / Switch 2 | 21 × 31 × 3 | Nominal envelope; small molding details approximated |
| PSP UMD | 65 × 64 × 4.2 | Sony's published cartridge envelope |

Additional references:

- [First-hand GBA measurements and drawing](https://gaming.stackexchange.com/questions/261086/what-are-the-game-boy-advance-gba-game-pak-rom-cartridge-physical-dimensions): approximately 57 × 35 × 8 mm for the main body, with a wider grip. The answer gives roughly ±0.5 mm uncertainty. The model includes the wider shoulder.
- [Sony's original PSP/UMD specifications, page 3](https://sonyinteractive.com/uploads/sites/5/2023/02/040512a.pdf): UMD enclosure dimensions and 60 mm disc.
- [ConsoleMods label dimensions](https://consolemods.org/wiki/Cart_Labels): front label proportions, including the tall N64 label and GBA's 43 × 22 mm sticker. NES, SNES and Genesis labels include top folds; the visible front uses the remaining area rather than stretching the entire wrap onto it. Existing label artwork is displayed on that front area; a separate top-strip image is not synthesized.
- [NESdev cartridge measurements](https://www.nesdev.org/wiki/NES_cartridge_dimensions): additional shell/PCB measurements and label template. The page was indexed but direct access was blocked during research; not treated as a verified source of additional dimensions.
- [Nintendo's Switch 2 cartridge identification](https://en-americas-support.nintendo.com/app/answers/detail/a_id/68572): red shell. The common Switch envelope is retained; tiny rear keying differences are not reproduced.
- The three supplied photographs guided the NES rib strip and shoulders, SNES raised center and lower recess, and Game Boy header/grip/label placement. The SNES photo is a cleaning cartridge and the GB photo a multicart: their graphics were not copied into game labels.

## Downloadable models found

- [PizzaHandhelds Game Boy cartridge CAD](https://github.com/PizzaHandhelds/GameboyCartCAD_FDM_Optimized): STL and SolidWorks files, optimized for FDM printing. Its [license file](https://github.com/PizzaHandhelds/GameboyCartCAD_FDM_Optimized/blob/main/LISCENCE) specifies CC BY-SA 4.0. Useful for a future mesh-based renderer; no geometry was imported or derived from these files.
- [Dimensionally accurate NES replica](https://makerworld.com/en/models/2146798-dimensionally-accurate-nes-cartridge-replica) and [SNES replica](https://makerworld.com/en/models/2180572-dimensionally-accurate-snes-cartridge-replica): found through the creator's [NES announcement](https://www.reddit.com/r/retrogaming/comments/1pt52j6/i_designed_a_dimensionally_accurate_nes_cart/) and [SNES announcement](https://www.reddit.com/r/retrogaming/comments/1q0cu6g/i_designed_a_dimensionally_accurate_snes/). MakerWorld blocked automated access, so download contents and license were not verified. Listed as leads, not shipped assets.
- [PAL SNES reproduction shell](https://www.printables.com/model/455661-snes-pal-reproduction-cartridge): a separate regional shape, found via the creator's [model announcement](https://www.reddit.com/r/3Dprinting/comments/19fkx5k/snes_pal_super_famicom_3d_cartridge_shell/). Not used for the US shell in this app; license and fit remain unverified.

## Case construction and scope

Plastic, clear, jewel and clamshell cases have separate solid lid and base rims,
seating lips, hinge blocks, latches and media retainers. Disc cases have raised
center hubs. Cardboard boxes retain top-opening behavior and add card thickness,
inner walls, a folded insert, two dust flaps and a tuck tab. These internal details
are representative visual approximations, not measured tooling for every case.

Regional/special shells (PAL SNES, EA Genesis, rumble/sensor cartridges, etc.) are
not automatically selected. Existing custom/photograph-derived shell colours still
take priority. Clear shells are represented by tinted solid material, not optical
transmission. Connector contacts are visible on card backs and inside the bottom
mouth of larger cartridges, never pasted across their front labels.

## Verification

Run `npm run models:check`. It exercises all 13 shell profiles and 25 packaging
profiles in the real Electron renderer using a fixture preload, and writes front,
back, edge, close-up, open-case and in-app captures under `output/models-*.png`.
No ROMs are launched and no real settings are changed. Optional local cover scans
are read for previews; generated artwork is used when absent.
