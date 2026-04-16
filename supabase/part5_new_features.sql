CREATE TABLE IF NOT EXISTS ai_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title TEXT, -- auto-generated from first message
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ai_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user','assistant')),
  content TEXT NOT NULL,
  error BOOLEAN DEFAULT false,
  image_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE ai_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own conversations"
  ON ai_conversations FOR ALL TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users can manage messages in their conversations"
  ON ai_messages FOR ALL TO authenticated
  USING (conversation_id IN (SELECT id FROM ai_conversations WHERE user_id = auth.uid()));

CREATE INDEX IF NOT EXISTS idx_ai_conversations_user ON ai_conversations(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_messages_conversation ON ai_messages(conversation_id, created_at ASC);
-- FY26 Annual Inventory (AI) Assets — imported from SITE 7009 (GL GOLF COURSE)
-- and SITE 7010 (GL GOLF COURSE MAINTENANCE) Flexible Asset Listings.
--
-- Status values:
--   'unverified'       — not yet confirmed by inventory
--   'verified_present' — auto-matched by serial # against equipment table, OR manually confirmed
--   'mia'              — Missing In Action (could not be located)
--   'disposed'         — confirmed disposed / retired
--
-- Auto-match logic: after inserting, any row whose serial_number matches an
-- existing equipment.serial_number is flipped to 'verified_present' and linked.

CREATE TABLE IF NOT EXISTS fy26_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site TEXT NOT NULL,                      -- '7009' or '7010'
  cost_center TEXT,
  resp_cost_center TEXT,
  asset_number TEXT NOT NULL,              -- e.g. '17307537'
  sub_number TEXT,                         -- sub-asset index
  license_plate TEXT,
  description TEXT NOT NULL,
  qty NUMERIC DEFAULT 1,
  model_text TEXT,                         -- "Model no / Asset Main text" from PDF
  serial_number TEXT,
  manufacturer TEXT,
  original_value NUMERIC,
  status TEXT NOT NULL DEFAULT 'unverified'
    CHECK (status IN ('unverified','verified_present','mia','disposed')),
  equipment_id UUID REFERENCES equipment(id) ON DELETE SET NULL,
  verified_at TIMESTAMPTZ,
  verified_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  notes TEXT,
  photo_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (site, asset_number, sub_number)
);

CREATE INDEX IF NOT EXISTS idx_fy26_assets_site ON fy26_assets(site);
CREATE INDEX IF NOT EXISTS idx_fy26_assets_status ON fy26_assets(status);
CREATE INDEX IF NOT EXISTS idx_fy26_assets_serial ON fy26_assets(serial_number);
CREATE INDEX IF NOT EXISTS idx_fy26_assets_manufacturer ON fy26_assets(manufacturer);

ALTER TABLE fy26_assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view fy26 assets"
  ON fy26_assets FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert fy26 assets"
  ON fy26_assets FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update fy26 assets"
  ON fy26_assets FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated can delete fy26 assets"
  ON fy26_assets FOR DELETE TO authenticated USING (true);

-- Seed data: SITE 7009 — GL GOLF COURSE
INSERT INTO fy26_assets (site, cost_center, resp_cost_center, asset_number, sub_number, description, qty, model_text, serial_number, manufacturer, original_value) VALUES
('7009','20091','20091','11005207','0','REFRESHMENT CART TRAILER',1,'BC660','A31692',NULL,1700.00),
('7009','20087','20087','11005208','0','SIGN/WILLOW GLEN GOLF COURSE',1,'SINGLE SIDED',NULL,NULL,1798.00),
('7009','20087','20087','11005221','0','GOLF BALL WASHER',1,'W-75','901079','WITTEK',1495.00),
('7009','25229','25229','11006241','0','ELECTRIC PRESSURE WASHER',1,'ELECTRIC PRESSURE WASHER',NULL,NULL,696.84),
('7009','20002','20087','16504980','0','TABLE, CLEAN CORNER',1,'S4- 74- 1842Z',NULL,NULL,2263.80),
('7009','20002','20087','16504982','0','TABLE BASE, METAL FINISH, BLACK',1,'B213-22',NULL,NULL,0.00),
('7009','20091','20091','16505042','0','REFRIGERATOR W/ GLASS DOOR',1,'BB48 B','6371368','BEVERAGE AIR',1153.67),
('7009','20087','20087','16505100','0','CHAIR, OPEN ARM SIDE',2,'ACCAPELLA LOW BLACK',NULL,NULL,1222.68),
('7009','20002','20087','16505101','0','DINING TABLE 35.5 ROUND',2,'KENDAL TEAK 4860',NULL,NULL,1004.09),
('7009','20091','20091','16505121','0','TV, 46" W/ARM WALL MOUNT',1,'LC-46D64U LCD HDTV','803813929','SHARP',1754.13),
('7009','25224','25224','16505174','0','BALL PICKER W/ 6 BASKETS',7,'SL-90',NULL,NULL,2307.00),
('7009','20087','20087','16505775','0','CYBERNET ALL-IN-ONE PC',1,'C22','LPCC22T-01400','CYBERNET',2125.00),
('7009','20087','20087','16505776','0','CYBERNET ALL-IN-ONE PC',1,'C22','LPCC22T-01362','CYBERNET',2125.00),
('7009','20087','20087','16505777','0','CYBERNET ALL-IN-ONE PC',1,'C22','LPCC22T-01376','CYBERNET',2125.00),
('7009','25224','25224','16506323','0','50 G JUNIOR BALL WASHER',1,'50 G JUNIOR BALL WASHER',NULL,NULL,2124.99),
('7009','25581','25581','16506681','0','JACOBSEN FAIRWAY MOWER',0,'JACOBSEN FAIRWAY MOWER',NULL,NULL,7060.00),
('7009','20087','20087','17000047','0','POS SYSTEM COMPLETE',1,'WITH REC TRAC SOFTWARE','36J2MM1',NULL,1003.30),
('7009','20087','20087','17000048','0','POS SYSTEM COMPLETE',1,'WITH REC TRAC SOFTWARE','36N3MM1',NULL,2108.13),
('7009','20091','20091','17000049','0','POS SYSTEM COMPLETE',1,'WITH REC TRAC SOFTWARE','36F3MM1',NULL,2251.06),
('7009','20087','20087','17000095','0','DESKTOP COMPUTER',1,'SB Z220','2UA2491HVZ','HEWLETT PACKARD',1111.03),
('7009','20087','20087','17000098','0','DESKTOP W/SMART CARD & KEYBOARD',1,'SB Z220','2UA2491HWS','HEWLETT PACKARD',1111.03),
('7009','20087','20087','17000100','0','DESKTOP COMPUTER',1,'SB Z220','2UA2491HW5','HEWLETT PACKARD',1111.03),
('7009','20087','20087','17000197','3','COLOR LASERJET PRINTER',1,'M553DN','JPBCK461V5','HEWLETT PACKARD',612.75),
('7009','20087','20087','17000198','4','LASERJET PRINTER',1,'M604DN','CNDCJDC2CQ','HEWLETT PACKARD',901.69),
('7009','20087','20087','17000198','7','LASERJET PRINTER',1,'M604DN','CNDCJDC2CT','HEWLETT PACKARD',901.69),
('7009','20087','20087','17000198','17','LASERJET PRINTER',1,'M604DN','CNDCJDD07R','HEWLETT PACKARD',901.69),
('7009','20087','20087','17000198','18','LASERJET PRINTER',1,'M604DN','CNDCJDD07S','HEWLETT PACKARD',901.69),
('7009','20087','20087','17306944','0','SIGN / WILLOW GLEN',1,'CONCEPT SUPRA II 2-SIDE/NON-ILLUMD',NULL,'J. M. STEWART',4955.68),
('7009','20087','20087','17307007','0','SIGNS, ALUMINUM TEE',18,'W/ALUMINUM POST & CAP & HANGAR ARM',NULL,NULL,10007.13),
('7009','25224','25224','17307097','0','RANGE BALL DISPENSER',1,'74731',NULL,NULL,2876.00),
('7009','20002','20087','17307101','0','CABINET, STORAGE BACKBAR',2,'BS108 QTY 1, BN24 QTY 1',NULL,NULL,4236.45),
('7009','20002','20087','17307124','0','CHAIR, LOUNGE, LEG FINISH',4,'S- T22',NULL,NULL,3082.80),
('7009','20002','20087','17307125','0','FOUNTAIN, SLATE, WALL',1,'HORIZONTAL FALLS',NULL,NULL,3549.00),
('7009','20002','20087','17307126','0','CABINET, CUSTOM',1,'CABINET, CUSTOM',NULL,NULL,72923.00),
('7009','20002','20087','17307127','0','RUG, CUSTOM AREA',1,'RUG, CUSTOM AREA',NULL,NULL,2869.16),
('7009','20002','20087','17307128','0','DESK, CREDENZA',4,'DESK, CREDENZA',NULL,NULL,14732.20),
('7009','25229','25229','17307142','0','GOLF CART, HANDICAP',1,'GOLF CART, HANDICAP',NULL,'E Z GO',7253.00),
('7009','25229','25229','17307143','0','GOLF CART, HANDICAP',1,'GOLF CART, HANDICAP',NULL,'E Z GO',7253.00),
('7009','20002','20087','17307157','0','TV, 52" W/ TILT WALL MOUNT',1,'LN-T5271F','AK2V3CFQ300302H','SAMSUNG',3003.34),
('7009','20087','20087','17307220','0','BEVERAGE CART, LOUNGE DELUXE',1,'YT2A-1BEV2','JW7-500490','YAMAHA',11948.72),
('7009','25229','25229','17307537','0','GOLF CART #1',1,'YDREP1H','JW9-611248','YAMAHA',2860.61),
('7009','25229','25229','17307538','0','GOLF CART #2',1,'YDREP1H','JW9-611260','YAMAHA',2860.61),
('7009','25229','25229','17307539','0','GOLF CART #3',1,'YDREP1H','JW9-611256','YAMAHA',2860.61),
('7009','25229','25229','17307540','0','GOLF CART #4',1,'YDREP1H','JW9-611231','YAMAHA',2860.61),
('7009','25229','25229','17307541','0','GOLF CART #5',1,'YDREP1H','JW9-611225','YAMAHA',2860.61),
('7009','25229','25229','17307542','0','GOLF CART #6',1,'YDREP1H','JW9-611221','YAMAHA',2860.61),
('7009','25229','25229','17307543','0','GOLF CART #7',1,'YDREP1H','JW9-611233','YAMAHA',2860.61),
('7009','25229','25229','17307544','0','GOLF CART #8',1,'YDREP1H','JW9-611218','YAMAHA',2860.61),
('7009','25229','25229','17307545','0','GOLF CART #9',1,'YDREP1H','JW9-611236','YAMAHA',2860.61),
('7009','25229','25229','17307546','0','GOLF CART #10',1,'YDREP1H','JW9-611223','YAMAHA',2860.61),
('7009','25229','25229','17307547','0','GOLF CART #11',1,'YDREP1H','JW9-611271','YAMAHA',2860.61),
('7009','25229','25229','17307548','0','GOLF CART #12',1,'YDREP1H','JW9-611255','YAMAHA',2860.61),
('7009','25229','25229','17307549','0','GOLF CART #13',1,'YDREP1H','JW9-611257','YAMAHA',2860.61),
('7009','25229','25229','17307550','0','GOLF CART #14',1,'YDREP1H','JW9-611267','YAMAHA',2860.61),
('7009','25229','25229','17307551','0','GOLF CART #15',1,'YDREP1H','JW9-611220','YAMAHA',2860.61),
('7009','25229','25229','17307552','0','GOLF CART #16',1,'YDREP1H','JW9-611254','YAMAHA',2860.61),
('7009','25229','25229','17307553','0','GOLF CART #17',1,'YDREP1H','JW9-611224','YAMAHA',2860.61),
('7009','25229','25229','17307554','0','GOLF CART #18',1,'YDREP1H','JW9-611228','YAMAHA',2860.61),
('7009','25229','25229','17307555','0','GOLF CART #19',1,'YDREP1H','JW9-611232','YAMAHA',2860.61),
('7009','25229','25229','17307556','0','GOLF CART #20',1,'YDREP1H','JW9-611229','YAMAHA',2860.61),
('7009','25229','25229','17307557','0','GOLF CART #21',1,'YDREP1H','JW9-611227','YAMAHA',2860.61),
('7009','25229','25229','17307558','0','GOLF CART #22',1,'YDREP1H','JW9-611270',NULL,2860.61),
('7009','25229','25229','17307559','0','GOLF CART #23',1,'YDREP1H','JW9-611258',NULL,2860.61),
('7009','25229','25229','17307560','0','GOLF CART #24',1,'YDREP1H','JW9-611261',NULL,2860.61),
('7009','25229','25229','17307561','0','GOLF CART #25',1,'YDREP1H','JW9-611247',NULL,2860.61),
('7009','25229','25229','17307562','0','GOLF CART #26',1,'YDREP1H','JW9-611222',NULL,2860.61),
('7009','25229','25229','17307563','0','GOLF CART #27',1,'YDREP1H','JW9-612840',NULL,2860.61),
('7009','25229','25229','17307564','0','GOLF CART #28',1,'YDREP1H','JW9-612838',NULL,2860.61),
('7009','25229','25229','17307565','0','GOLF CART #29',1,'YDREP1H','JW9-612839',NULL,2860.61),
('7009','25229','25229','17307566','0','GOLF CART #30',1,'YDREP1H','JW9-612841',NULL,2860.61),
('7009','25229','25229','17307567','0','GOLF CART #31',1,'YDREP1H','JW9-612842',NULL,2860.61),
('7009','25229','25229','17307568','0','GOLF CART #32',1,'YDREP1H','JW9-612843',NULL,2860.61),
('7009','25229','25229','17307569','0','GOLF CART #33',1,'YDREP1H','JW9-612844',NULL,2860.61),
('7009','25229','25229','17307570','0','GOLF CART #34',1,'YDREP1H','JW9-612845',NULL,2860.61),
('7009','25229','25229','17307571','0','GOLF CART #35',1,'YDREP1H','JW9-612847',NULL,2860.61),
('7009','25229','25229','17307572','0','GOLF CART #36',1,'YDREP1H','JW9-612846',NULL,2860.61),
('7009','25229','25229','17307573','0','GOLF CART #37',1,'YDREP1H','JW9-612848',NULL,2860.61),
('7009','25229','25229','17307574','0','GOLF CART #38',1,'YDREP1H','JW9-612849',NULL,2860.61),
('7009','25229','25229','17307575','0','GOLF CART #39',1,'YDREP1H','JW9-612815',NULL,2860.61),
('7009','25229','25229','17307576','0','GOLF CART #40',1,'YDREP1H','JW9-612850',NULL,2860.61),
('7009','25229','25229','17307577','0','GOLF CART #41',1,'YDREP1H','JW9-612828',NULL,2860.61),
('7009','25229','25229','17307578','0','GOLF CART #42',1,'YDREP1H','JW9-612829',NULL,2860.61),
('7009','25229','25229','17307579','0','GOLF CART #43',1,'YDREP1H','JW9-612830',NULL,2860.61),
('7009','25229','25229','17307580','0','GOLF CART #44',1,'YDREP1H','JW9-612831',NULL,2860.61),
('7009','25229','25229','17307581','0','GOLF CART #45',1,'YDREP1H','JW9-612833',NULL,2860.61),
('7009','25229','25229','17307582','0','GOLF CART #46',1,'YDREP1H','JW9-612832',NULL,2860.61),
('7009','25229','25229','17307583','0','GOLF CART #47',1,'YDREP1H','JW9-612835',NULL,2860.61),
('7009','25229','25229','17307584','0','GOLF CART #48',1,'YDREP1H','JW9-612834',NULL,2860.61),
('7009','25229','25229','17307585','0','GOLF CART #49',1,'YDREP1H','JW9-612836',NULL,2860.61),
('7009','25229','25229','17307586','0','GOLF CART #50',1,'YDREP1H','JW9-613100',NULL,2860.61),
('7009','25229','25229','17307587','0','GOLF CART #51',1,'YDREP1H','JW9-611226',NULL,2860.61),
('7009','25229','25229','17307588','0','GOLF CART #52',1,'YDREP1H','JW9-611243',NULL,2860.61),
('7009','25229','25229','17307589','0','GOLF CART #53',1,'YDREP1H','JW9-611219',NULL,2860.61),
('7009','25229','25229','17307590','0','GOLF CART #54',1,'YDREP1H','JW9-611238',NULL,2860.61),
('7009','25229','25229','17307591','0','GOLF CART #55',1,'YDREP1H','JW9-611269',NULL,2860.61),
('7009','25229','25229','17307592','0','GOLF CART #56',1,'YDREP1H','JW9-611265',NULL,4260.61),
('7009','25229','25229','17307593','0','GOLF CART #57',1,'YDREP1H','JW9-611272',NULL,4260.61),
('7009','25229','25229','17307594','0','GOLF CART #58',1,'YDREP1H','JW9-611230',NULL,4260.61),
('7009','25229','25229','17307595','0','GOLF CART #59',1,'YDREP1H','JW9-616641',NULL,4260.61),
('7009','25229','25229','17307596','0','GOLF CART #60',1,'YDREP1H','JW9-616639',NULL,4260.61),
('7009','20087','20087','17308218','0','SIGN, WHITE LEXAN FACES',1,'4'' W X 12'' H',NULL,NULL,2550.00),
('7009','20087','25581','17308600','0','JACOBSEN TRIPLEX MOWER',1,'GP400','GZ500695','JACOBSEN',48500.00),
('7009','25581','25581','17308762','0','TORO ROUGH MOWER',2,'4700',NULL,NULL,39500.00),
('7009','25581','25581','17308763','0','TORO ROUGH MOWER',2,'4500',NULL,NULL,19500.00),
('7009','25581','25581','17308764','0','TORO ROUGH MOWER',2,'3500',NULL,NULL,17900.00),
('7009','25581','25581','17308765','0','RYAN AERATOR',2,'G30',NULL,NULL,4900.00),
('7009','25581','25581','17308766','0','REDEXIM RAPIDCORE AERATOR',2,'1600',NULL,NULL,7500.00),
('7009','25581','25581','17308870','0','2017 GREENS PRO',0,'2017 GREENS PRO',NULL,NULL,7666.66),
('7009','25581','25581','17308871','0','2018 GREENS PRO',0,'2017 GREENS PRO',NULL,NULL,7666.67),
('7009','25581','25581','17308872','0','2018 BLOWER',5,'2018 BLOWER',NULL,NULL,8116.67),
('7009','24999','20087','17500133','0','RESTROOM BUILDING',1,'DOUBLE VAULT/DESERT SAND BRICK','FY00-004-40','APS CONCRETE PRODUCTS',21373.54),
('7009','24998','24999','17500135','0','GOLF CLUBHOUSE',1,'GOLF CLUBHOUSE',NULL,NULL,0.00),
('7009','24999','20087','17701103','0','RENOVATION / BACK 9 / PHASE 1',1,'RENOVATION / BACK 9 / PHASE 1','FY00-004-40',NULL,1907615.37),
('7009','24999','25224','17701104','0','PRACTICE RANGE IMPROVEMENT',1,'30'' & 50 POLES, NETTING & INSTALLATION',NULL,NULL,24107.00),
('7009','24999','20087','17701105','0','BACK 9 RENOVATION, PHASE 2',1,'BACK 9 RENOVATION, PHASE 2','FY00-004-40',NULL,123736.16),
('7009','20087','20087','17901231','0','GLK REPAIRS/REPLACEMENT',1,'GOLF RANGE NETTING, 23-GLK-08',NULL,NULL,0.00),
('7009','20087','20087','17901286','0','GREAT LAKES GOLF RETENTION POND DREDGING 25-GLK-02',0,'GREAT LAKES GOLF RETENTION POND DREDGING 25-GLK-02',NULL,NULL,611097.00),
('7009','20087','20087','17901306','0','GLK GOLF TREE TRIMMING AND REMOVAL',0,'GLK GOLF TREE TRIMMING AND REMOVAL',NULL,NULL,25000.00);

-- Seed data: SITE 7010 — GL GOLF COURSE MAINTENANCE
INSERT INTO fy26_assets (site, cost_center, asset_number, license_plate, description, qty, model_text, serial_number, manufacturer, original_value) VALUES
('7010','20087','10008336',NULL,'GILL RAKE PULVERIZER',1,'SP-2572','L-49544','LANDSPRIDE',1242.80),
('7010','20087','10008369',NULL,'GRINDER / BED KNIFE',1,'GRINDER / BED KNIFE','224','FOLEY',4000.00),
('7010','20087','10008370',NULL,'GENERATOR / 9000 WATT',1,'GA902EH','594015','HONDA',2990.00),
('7010','20087','10008380',NULL,'AMP VOLTAGE & REGULATOR TEST',1,'MT3750KP','95449202','SNAP-ON',1351.20),
('7010','20087','10008381',NULL,'AMP VOLTAGE & REGULATOR TEST',1,'MT3750KR','95449186','SNAP-ON',1351.20),
('7010','20087','10008395',NULL,'GREENSMOWER /1992',1,'GREENSMOWER /1992','E00022G905090','JOHN DEERE',3688.12),
('7010','20087','10008397',NULL,'RYAN CARE MACHINE / 1977',1,'544801770','66343','RYAN',2835.00),
('7010','20087','10008435',NULL,'MID-RISE SCISSOR LIFT',1,'EELR338A','M16761','WHEELTRONIC',2621.25),
('7010','20087','10008517',NULL,'LOADER SCOOP TYPE',1,'610C','TO610CB739125','JOHN DEERE',47762.00),
('7010','20087','11005210',NULL,'TOPDRESSER FINISHING BRUSH ATTACH',1,'QUICK PASS 300/450','6149','TYCROP',1115.00),
('7010','20087','11005211',NULL,'TOPDRESSER TWIN SPINNER ATTACH',1,'QUICK PASS 300/450','6063','TYCROP',1862.00),
('7010','20087','11005212',NULL,'WOODEN BRIDGE',1,'WOODEN BRIDGE',NULL,NULL,1777.00),
('7010','20087','11005213',NULL,'WOODEN BRIDGE',1,'WOODEN BRIDGE',NULL,NULL,1777.00),
('7010','20087','11005214',NULL,'WOODEN BRIDGE',1,'WOODEN BRIDGE',NULL,NULL,1382.75),
('7010','20087','11005215',NULL,'TRACTOR SPREADER',1,'TRACTOR SPREADER','931-0529','LILY',1300.00),
('7010','20087','11005216',NULL,'SOD CUTTER',1,'5448458710','124-218','RYAN',1669.40),
('7010','20087','11005220',NULL,'FAIRWAY AERATOR',1,'270','E00270G759192','JOHN DEERE',2437.28),
('7010','20087','11005222',NULL,'PTO TILLER',1,'660','TY0660E009817','JOHN DEERE',2100.00),
('7010','20087','11005223',NULL,'CORE HARVESTER',1,'CORE HARVESTER','CUS-895100064','CUSHMAN',2054.00),
('7010','20087','11005224',NULL,'MOWER W/MULCHER',1,'GS30','MO0S30X021640','JOHN DEERE',2214.45),
('7010','20087','11005632',NULL,'BUNKER & FIELD RAKE',1,'TC1200A','170495','JOHN DEERE',10358.10),
('7010','20087','11006376',NULL,'SPRAYER 1991',1,'SMITHCO','H8503',NULL,5875.05),
('7010','20087','11006377',NULL,'GRINDER POLISHER 1995',1,'3096','260',NULL,6000.00),
('7010','20087','11006380',NULL,'TRACTOR BUNKER RAKE 2010',1,'1200A','DOM20100803',NULL,10358.00),
('7010','20087','11006381',NULL,'MOWER LAWN 1997',1,'N/A','04327-30501',NULL,10877.19),
('7010','20087','16505133',NULL,'MOWER 32" DECK',1,'M15KA322P','733158',NULL,2193.73),
('7010','20002','16505175','456652','MOWER ROUGH CUT',1,'RTDH-60','12-46282','BRUSH HOG',1445.00),
('7010','20087','16506670',NULL,'JACOBSEN FAIRWAY MOWER',0,'JACOBSEN FAIRWAY MOWER',NULL,NULL,7060.00),
('7010','20087','17000099',NULL,'DESKTOP COMPUTER W/SMART CARD & KEYBOARD',1,'SB Z220','2UA2491HW0','HEWLETT PACKARD',1111.03),
('7010','20087','17100826','447570','P/UP TRUCK 2002',1,'SILVERADO 2500/CK25903 - 4X4','1GCHK24U62Z108031','CHEVROLET (GENERAL MOTORS)',26659.00),
('7010','20087','17306600',NULL,'GREENSMASTER W ROLLERS & KNIFE',1,'GREENSMASTER','280000170','TORO',14696.30),
('7010','20087','17306600-CU',NULL,'CUTTING UNITS',4,'GREENSMASTER','280007828','TORO',4922.64),
('7010','20087','17306630',NULL,'MOWER WITH 60" DECK',1,'74925','311000314','TORO',8474.31),
('7010','20087','17306631',NULL,'BLOWER TURBINE TOWABLE',1,'PRO FORCE','11000809-44538','TORO',5891.00),
('7010','20087','17306677',NULL,'FOUNTAIN AERATOR',1,'2 HP',NULL,'KASCO',3333.76),
('7010','20087','17306678',NULL,'FOUNTAIN AERATOR',1,'2 HP',NULL,'KASCO',4123.76),
('7010','20087','17306717',NULL,'GOLF BALL PICKER',1,'GOLF BALL PICKER',NULL,'WITTEK GOLF SUPPLY',2359.00),
('7010','20087','17306724',NULL,'SET OF THREE GREEN ROLLERS',1,'TS3TQ-00006037','T2001 3Q','TURF LINE / TRUE SURFACE',5295.00),
('7010','20087','17306725',NULL,'AERATOR WITH ROLLER ATTACH',1,'BA400-SSH','111-1164','BANNERMAN',2875.00),
('7010','20087','17306726',NULL,'FAIRWAY AERATOR',1,'FINE TUNE/3-PT HITCH','E67932-6-99','AERWAY',5200.00),
('7010','20087','17306727',NULL,'TOP DRESSER WITH HOPPER',1,'QP300 (11HP HONDA)','6235','TYCORP',6625.00),
('7010','20087','17306731','445784','GOLF CART',1,'TXT-GAS','1306179','E-Z-GO DIVISION OF TEXTRON',3563.00),
('7010','20087','17306732','445787','GOLF CART / 2000',1,'TXT-GAS','1306223','E-Z-GO DIVISION OF TEXTRON',3563.00),
('7010','20087','17306733','445805','GOLF CART',1,'TXT-GAS','1306342','E-Z-GO DIVISION OF TEXTRON',3563.00),
('7010','20087','17306734','445891','UTILITY CAR',1,'1921W','W004X2X046498','JOHN DEERE',5313.57),
('7010','20087','17306777','447721','GREENSMASTER / 2002',1,'3100 TRACTION UNIT','04356-0210001803','TORO',13571.25),
('7010','20087','17306832',NULL,'TRACTOR',1,'950-DIESEL','CH0950503025','JOHN DEERE',9449.00),
('7010','20087','17306834',NULL,'MOWER / GREENSMASTER',1,'GMR-04350','91539','TORO',12287.00),
('7010','20091','17306863',NULL,'ICE CUBER WITH STORAGE BIN',1,'CM1000 & BH800',NULL,'SCOTTMAN',3394.00),
('7010','20087','17306878','440510','TRUCKSTER / 1995',1,'898630','94004655','CUSHMAN',8398.00),
('7010','20087','17306879','440511','TRACTOR/LOADER 1994',1,'M5030SU','20168','KUBOTA',10947.00),
('7010','20087','17306894','441824','TRUCKSTER 1996',1,'HEAVY DUTY/3 WHEEL','96009140','CUSHMAN',8616.00),
('7010','20087','17306895','441927','TRACTOR 1996',1,'5200','LV5200E520401','JOHN DEERE',13841.00),
('7010','20087','17306923',NULL,'MOWER / GREENSMASTER',1,'GM3050 / 04351','14351-80329','TORO',10948.24),
('7010','20087','17306932',NULL,'TRACTOR / 1998',1,'M4700S','30376','KUBOTA',15795.00),
('7010','20087','17307006',NULL,'TURF MOWER',1,'3215B TURF SYSTEM I','TC3215B040256','JOHN DEERE',26816.35),
('7010','20087','17307008','450165','GATOR',1,'PROGATOR 2030 (DIESEL)','VG2030A030015','JOHN DEERE',11580.00),
('7010','20087','17307009','450166','GATOR',1,'4X2 - ELECTRIC','WOE4X2E011309','JOHN DEERE',5235.00),
('7010','20087','17307010','450167','GREENSMOWER/TEE',1,'2500 (DIESEL)','TC2500D015302','JOHN DEERE',9500.00),
('7010','20087','17307016',NULL,'ROTARY FLEX MOWER',1,'721 XR','18291104','LASTEC',15000.00),
('7010','20087','17307020',NULL,'ZERO TURN MOWER',1,'2260ES (61" DECK)','74221200102','JACOBSEN',5705.00),
('7010','20087','17307022',NULL,'GREENS MOWER CUTTING UNITS',1,'(SET OF 3)','250010230,433 &499','TORO',5368.61),
('7010','20087','17307023',NULL,'GREENS MOWER',1,'(SET OF 3 - CUTTING & GROOMING UNITS)','250010497,498 &231','TORO',9067.48),
('7010','20087','17307027',NULL,'TRAILER MOUNTED SPRAYER',1,'TM300','52942','JOHN DEERE',10650.00),
('7010','20087','17307033',NULL,'BUNKER & FIELD RACK',1,'1200A','TC1200A155248','JOHN DEERE',9372.51),
('7010','20087','17307039',NULL,'AERATOR',1,'AERCORE 800','TC800AC060262','JOHN DEERE',13478.23),
('7010','20087','17307160',NULL,'FOUNTAIN INCLUDING INSTALL',1,'M5452-3SC',NULL,NULL,9515.00),
('7010','20087','17307166',NULL,'FOUNTAIN AERATOR 2 HP',1,'8400/VFX',NULL,'KASCO',3373.00),
('7010','20087','17307173',NULL,'MOWER FAIRWAY',2,'7500E','TC75EHX020122',NULL,39686.25),
('7010','20087','17307189',NULL,'60 HP VFD DRIVE (PUMP PANEL)',1,'ATV61HD45N4',NULL,NULL,5461.75),
('7010','20087','17307210',NULL,'GRINDER BEDKNIFE IDEAL',1,'1100 AUTOMATIC 2007','18026',NULL,7000.00),
('7010','20087','17307211',NULL,'GRINDER REEL IDEAL',1,'SIMPLEX 2000 MODEL YEAR 2007','15483',NULL,7000.00),
('7010','20087','17307221',NULL,'BUNKER/FIELD RAKE',1,'1200A','ITC1200AVDT200524','JOHN DEERE',10621.12),
('7010','20087','17307222',NULL,'GATOR 4X2 TS JOHN DEERE',1,'4X2SJ','1M04X2SJCEM090942','JOHN DEERE',6472.13),
('7010','20087','17307223',NULL,'MOWER ROTARY FLEX LASTEC',1,'721XR','50640414',NULL,14050.00),
('7010','20087','17307230',NULL,'MOWER GREENSMASTER 3150-Q',1,'04358','314000636','TORO',20922.93),
('7010','20087','17307770',NULL,'BUNKER MATERIALS & LABOR',1,'BUNKER MATERIALS & LABOR',NULL,NULL,63905.82),
('7010','20087','17308025',NULL,'JOHN DEERE SELECT',1,'SPRAY HD200',NULL,'JOHN DEERE',11616.27),
('7010','20087','17308029',NULL,'CUSHMAN HAULER',1,'800X GAS',NULL,'TEXTRON',5208.65),
('7010','20087','17308030',NULL,'CUSHMAN HAULER',1,'800X GAS',NULL,'TEXTRON',5208.65),
('7010','20087','17308031',NULL,'GREENS KING IV PLUS MOWER',1,'GREENS KING IV PLUS MOWER',NULL,'JACOBSEN',24851.38),
('7010','20087','17308032',NULL,'TORO WORKMAN',1,'TORO WORKMAN',NULL,'TORO',17531.66),
('7010','20087','17308305',NULL,'FAIRWAY MOWER',1,'MOWER REPLACEMENT',NULL,'JOHN DEERE',25000.00),
('7010','20087','17308530',NULL,'MOWER, GREENSMASTER 3150-Q',1,'MOWER, GREENSMASTER 3150-Q',NULL,'TORO',24535.23),
('7010','25581','17308582',NULL,'GOLF STAND-UP GREENS ROLLER',1,'GOLF STAND-UP GREENS ROLLER',NULL,NULL,0.00),
('7010','20087','17308867',NULL,'TORO GREENS PRO 1260',0,'TORO GREENS PRO 1260',NULL,NULL,7666.66),
('7010','20087','17308868',NULL,'TORO GREENS PRO 1260',0,'TORO GREENS PRO 1260',NULL,NULL,7666.66),
('7010','20087','17308869',NULL,'BUFFALOT TURBINE KB23 BLOWER',0,'BUFFALOT TURBINE KB23 BLOWER',NULL,NULL,8116.67),
('7010','24999','17701133',NULL,'GOLF MAINTENANCE BUILDING',1,'GOLF MAINTENANCE BUILDING',NULL,NULL,8988.26),
('7010','24999','17701169',NULL,'GLK GOLF CART PATH',1,'GLK GOLF CART PATH',NULL,NULL,55486.19),
('7010','24999','17701248',NULL,'IRRIGATION PUMP HOUSE REPLACEMENT',3,'IRRIGATION PUMP HOUSE REPLACEMENT',NULL,NULL,28569.30),
('7010','24999','17800039',NULL,'WILLOW GLEN IRRIGATION SYSTEM',1,'90-BUPERS #N-90017 & 05-NEW TRANSFORMER',NULL,NULL,324034.38),
('7010','20083','89004691',NULL,'PARTS CLEANER',1,'BCK600CS','511614','BIO-CIRCLE',1660.00);

-- Auto-match: any asset whose serial_number matches an existing equipment
-- row's serial_number gets flipped to 'verified_present' and linked.
UPDATE fy26_assets fa
SET
  status = 'verified_present',
  equipment_id = e.id,
  verified_at = NOW()
FROM equipment e
WHERE fa.serial_number IS NOT NULL
  AND fa.serial_number = e.serial_number
  AND fa.status = 'unverified';

-- Everything remaining gets flagged as MIA (Missing In Action) by default
-- so the user can walk the yard and flip items to verified_present.
UPDATE fy26_assets
SET status = 'mia'
WHERE status = 'unverified';

-- trigger to keep updated_at fresh
CREATE OR REPLACE FUNCTION update_fy26_assets_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_fy26_assets_updated_at ON fy26_assets;
CREATE TRIGGER trg_fy26_assets_updated_at
  BEFORE UPDATE ON fy26_assets
  FOR EACH ROW
  EXECUTE FUNCTION update_fy26_assets_updated_at();
-- Revenue tracking for GM oversight
CREATE TABLE IF NOT EXISTS revenue_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
  category TEXT NOT NULL CHECK (category IN ('greens_fees','cart_rentals','pro_shop','food_beverage','events','memberships','driving_range','other')),
  amount NUMERIC(10,2) NOT NULL,
  description TEXT,
  rounds_count INTEGER, -- for greens_fees category
  notes TEXT,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Capital projects for GM tracking
CREATE TABLE IF NOT EXISTS capital_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed','approved','in_progress','completed','cancelled')),
  budget_amount NUMERIC(12,2),
  spent_amount NUMERIC(12,2) DEFAULT 0,
  start_date DATE,
  target_completion DATE,
  actual_completion DATE,
  category TEXT CHECK (category IN ('renovation','equipment','infrastructure','building','irrigation','other')),
  approval_notes TEXT,
  approved_by TEXT,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE revenue_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE capital_projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view revenue" ON revenue_entries FOR SELECT TO authenticated USING (true);
CREATE POLICY "Leadership can manage revenue" ON revenue_entries FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated can view projects" ON capital_projects FOR SELECT TO authenticated USING (true);
CREATE POLICY "Leadership can manage projects" ON capital_projects FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_revenue_date ON revenue_entries(entry_date DESC);
CREATE INDEX IF NOT EXISTS idx_revenue_category ON revenue_entries(category);
CREATE INDEX IF NOT EXISTS idx_capital_projects_status ON capital_projects(status);
-- Irrigation zones (physical areas with sprinkler heads)
CREATE TABLE IF NOT EXISTS irrigation_zones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  zone_number INTEGER UNIQUE,
  zone_type TEXT NOT NULL DEFAULT 'rotor' CHECK (zone_type IN ('rotor','spray','drip','bubbler','manual')),
  area TEXT CHECK (area IN ('green','tee','fairway','rough','practice','landscape','clubhouse')),
  hole_numbers INTEGER[],
  gpm NUMERIC(6,1),           -- gallons per minute flow rate
  head_count INTEGER,
  notes TEXT,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Irrigation schedules (when zones run)
CREATE TABLE IF NOT EXISTS irrigation_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  zone_id UUID NOT NULL REFERENCES irrigation_zones(id) ON DELETE CASCADE,
  day_of_week INTEGER[] NOT NULL,   -- 0=Sun, 1=Mon... 6=Sat
  start_time TIME NOT NULL,
  run_minutes INTEGER NOT NULL,
  enabled BOOLEAN DEFAULT true,
  season TEXT CHECK (season IN ('spring','summer','fall','winter','year_round')),
  notes TEXT,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Irrigation run log (actual runs — manual or automatic)
CREATE TABLE IF NOT EXISTS irrigation_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  zone_id UUID NOT NULL REFERENCES irrigation_zones(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  run_minutes INTEGER,
  gallons_used NUMERIC(10,1),
  run_type TEXT DEFAULT 'scheduled' CHECK (run_type IN ('scheduled','manual','syringe','weather_skip')),
  skipped BOOLEAN DEFAULT false,
  skip_reason TEXT,
  notes TEXT,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE irrigation_zones ENABLE ROW LEVEL SECURITY;
ALTER TABLE irrigation_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE irrigation_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth view zones" ON irrigation_zones FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth manage zones" ON irrigation_zones FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Auth view schedules" ON irrigation_schedules FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth manage schedules" ON irrigation_schedules FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Auth view runs" ON irrigation_runs FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth manage runs" ON irrigation_runs FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_irrigation_zones_area ON irrigation_zones(area);
CREATE INDEX IF NOT EXISTS idx_irrigation_schedules_zone ON irrigation_schedules(zone_id);
CREATE INDEX IF NOT EXISTS idx_irrigation_runs_zone ON irrigation_runs(zone_id, started_at DESC);

-- Seed some example zones for Great Lakes
INSERT INTO irrigation_zones (name, zone_number, zone_type, area, hole_numbers, gpm, head_count) VALUES
('Green 1', 1, 'spray', 'green', '{1}', 15.0, 6),
('Green 2', 2, 'spray', 'green', '{2}', 15.0, 6),
('Green 3', 3, 'spray', 'green', '{3}', 15.0, 6),
('Green 4', 4, 'spray', 'green', '{4}', 12.0, 5),
('Green 5', 5, 'spray', 'green', '{5}', 15.0, 6),
('Green 6', 6, 'spray', 'green', '{6}', 15.0, 6),
('Green 7', 7, 'spray', 'green', '{7}', 18.0, 7),
('Green 8', 8, 'spray', 'green', '{8}', 12.0, 5),
('Green 9', 9, 'spray', 'green', '{9}', 15.0, 6),
('Green 10', 10, 'spray', 'green', '{10}', 15.0, 6),
('Green 11', 11, 'spray', 'green', '{11}', 15.0, 6),
('Green 12', 12, 'spray', 'green', '{12}', 12.0, 5),
('Green 13', 13, 'spray', 'green', '{13}', 15.0, 6),
('Green 14', 14, 'spray', 'green', '{14}', 18.0, 7),
('Green 15', 15, 'spray', 'green', '{15}', 15.0, 6),
('Green 16', 16, 'spray', 'green', '{16}', 12.0, 5),
('Green 17', 17, 'spray', 'green', '{17}', 15.0, 6),
('Green 18', 18, 'spray', 'green', '{18}', 15.0, 6),
('Fairway 1', 19, 'rotor', 'fairway', '{1}', 45.0, 12),
('Fairway 5', 20, 'rotor', 'fairway', '{5}', 50.0, 14),
('Fairway 9', 21, 'rotor', 'fairway', '{9}', 42.0, 11),
('Fairway 10', 22, 'rotor', 'fairway', '{10}', 48.0, 13),
('Fairway 14', 23, 'rotor', 'fairway', '{14}', 52.0, 15),
('Fairway 18', 24, 'rotor', 'fairway', '{18}', 46.0, 12),
('Practice Green', 25, 'spray', 'practice', NULL, 20.0, 8),
('Driving Range', 26, 'rotor', 'practice', NULL, 35.0, 10),
('Clubhouse Landscape', 27, 'drip', 'clubhouse', NULL, 8.0, 20);
CREATE TABLE IF NOT EXISTS tournaments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  event_date DATE NOT NULL,
  event_end_date DATE,        -- for multi-day events
  event_type TEXT NOT NULL DEFAULT 'tournament' CHECK (event_type IN ('tournament','outing','league','charity','military','practice_round','other')),
  status TEXT NOT NULL DEFAULT 'planning' CHECK (status IN ('planning','confirmed','setup','in_progress','completed','cancelled')),
  expected_players INTEGER,
  format TEXT,                -- e.g. "Scramble", "Stroke Play", "Best Ball"
  shotgun_start BOOLEAN DEFAULT false,
  first_tee_time TIME,
  contact_name TEXT,
  contact_phone TEXT,
  contact_email TEXT,
  notes TEXT,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tournament_checklist_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN ('course_setup','equipment','signage','food_beverage','staffing','communication','post_event')),
  title TEXT NOT NULL,
  description TEXT,
  assigned_to UUID REFERENCES profiles(id),
  due_date DATE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','in_progress','completed','na')),
  sort_order INTEGER DEFAULT 0,
  completed_at TIMESTAMPTZ,
  completed_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE tournaments ENABLE ROW LEVEL SECURITY;
ALTER TABLE tournament_checklist_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth view tournaments" ON tournaments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth manage tournaments" ON tournaments FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Auth view checklist" ON tournament_checklist_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth manage checklist" ON tournament_checklist_items FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_tournaments_date ON tournaments(event_date);
CREATE INDEX IF NOT EXISTS idx_tournaments_status ON tournaments(status);
CREATE INDEX IF NOT EXISTS idx_tournament_checklist_tournament ON tournament_checklist_items(tournament_id, sort_order);
CREATE TABLE IF NOT EXISTS vendors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  company TEXT,
  phone TEXT,
  email TEXT,
  category TEXT NOT NULL DEFAULT 'general'
    CHECK (category IN ('spray_contractor','equipment_dealer','parts_supplier','irrigation','landscaping','construction','fuel','seed_sod','general')),
  supplies TEXT, -- what they provide
  contract_end_date DATE,
  notes TEXT,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE vendors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can view vendors" ON vendors FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can manage vendors" ON vendors FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_vendors_category ON vendors(category);
-- ============================================================
-- Fix: allow everyone on the team to read equipment photos,
--      regardless of who uploaded them.
--
-- Symptom: Eric uploaded equipment photos. When anyone else
-- (Tyson, Jim, etc.) runs the equipment report, the images
-- don't render. The default Supabase policy on storage.objects
-- restricts SELECT to the owner, so only Eric could see them.
--
-- Fix:
--   1. Mark the `photos` bucket public so the CDN URL works
--      even for unauthenticated clients (PDF generators, etc.).
--   2. Add an explicit "anyone can read photos" policy on
--      storage.objects so the authenticated download path used
--      by the server-side report also succeeds.
--
-- Safe to re-run. Uses ON CONFLICT / IF NOT EXISTS patterns.
-- ============================================================

-- 1. Ensure the bucket exists and is public.
INSERT INTO storage.buckets (id, name, public)
VALUES ('photos', 'photos', true)
ON CONFLICT (id) DO UPDATE
  SET public = true;

-- 2. Drop any previous policy with the same name so we can re-create it.
DROP POLICY IF EXISTS "Anyone can view equipment photos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload equipment photos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update equipment photos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete equipment photos" ON storage.objects;

-- 3. Public read — anyone (including anon / server-side) can SELECT.
CREATE POLICY "Anyone can view equipment photos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'photos');

-- 4. Authenticated write — any signed-in staffer can upload.
CREATE POLICY "Authenticated users can upload equipment photos"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'photos' AND auth.uid() IS NOT NULL);

-- 5. Authenticated update/delete — any signed-in staffer can manage
--    photos. (The app already restricts the UI to managers; this
--    just makes sure RLS doesn't block the legitimate calls.)
CREATE POLICY "Authenticated users can update equipment photos"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'photos' AND auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can delete equipment photos"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'photos' AND auth.uid() IS NOT NULL);

-- Verify
SELECT id, name, public FROM storage.buckets WHERE id = 'photos';
SELECT policyname, cmd FROM pg_policies
WHERE schemaname = 'storage' AND tablename = 'objects'
  AND policyname LIKE '%equipment photos%'
ORDER BY cmd;
-- FY26 Asset condition photos (front / back / left / right)
-- Stored as JSONB with fixed keys so each angle is tracked independently.
ALTER TABLE fy26_assets
  ADD COLUMN IF NOT EXISTS condition_photos JSONB DEFAULT '{}';
-- Shape: { "front": "url", "back": "url", "left": "url", "right": "url" }

-- Damage documentation log — each row is one damage event
CREATE TABLE IF NOT EXISTS asset_damage_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id UUID NOT NULL REFERENCES fy26_assets(id) ON DELETE CASCADE,
  damage_date TEXT NOT NULL,           -- "Prior to April 1 2026" or ISO date "2026-04-16"
  description TEXT NOT NULL,           -- what happened / how
  photos TEXT[] DEFAULT '{}',          -- array of photo URLs
  reported_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE asset_damage_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth view damage records"
  ON asset_damage_records FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth manage damage records"
  ON asset_damage_records FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_asset_damage_asset ON asset_damage_records(asset_id, created_at DESC);
-- Add manufacturer service tracking to equipment_service_records.
-- When a piece of equipment is sent to the manufacturer for service,
-- we need to track pickup and return dates.

ALTER TABLE equipment_service_records
  ADD COLUMN IF NOT EXISTS sent_to_manufacturer BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS pickup_date DATE,
  ADD COLUMN IF NOT EXISTS return_date DATE;

-- Index for quick lookup of equipment currently out for manufacturer service
CREATE INDEX IF NOT EXISTS idx_service_records_manufacturer
  ON equipment_service_records(sent_to_manufacturer, return_date)
  WHERE sent_to_manufacturer = true;
