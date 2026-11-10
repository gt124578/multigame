#!/usr/bin/env python3
"""tools/odyssee-detourer.py — enlève le damier violet / blanc (et le cadre noir) des planches partagées sur DeviantArt.
Usage : python3 tools/odyssee-detourer.py <planche.png> <sortie.png>"""
import sys
import numpy as np
from PIL import Image
from scipy import ndimage

a = np.array(Image.open(sys.argv[1]).convert('RGBA'))
rgb = a[..., :3].astype(int)
violet = (rgb == [111, 49, 152]).all(-1)
blanc = (rgb == [255, 255, 255]).all(-1)
lab, n = ndimage.label(violet | blanc)
fond = np.isin(lab, np.unique(lab[violet]))
noir = (rgb == 0).all(-1)
cadre = noir & np.isin(ndimage.label(noir)[0], np.unique(ndimage.label(noir)[0][[0, -1], :]))   # cadre noir relié au bord
a[fond | cadre, 3] = 0
Image.fromarray(a).save(sys.argv[2])
