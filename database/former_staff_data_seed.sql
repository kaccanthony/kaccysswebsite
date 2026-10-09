-- Hall of Fame seed exported from Townhall!B30:AF49 on 2026-10-09.
-- Run staff_archived_roblox_id.sql before this seed.
-- For each Roblox ID, replace only the first placeholder, for example:
-- NULLIF('123456789', '[TO BE ADDED]')::bigint
-- Sheet names are temporary display/Discord names. Replace negative staff_id values
-- and '[TO BE ADDED]' Roblox usernames when the real account details are available.
-- Nationality and flag data are deliberately excluded.

INSERT INTO public.staff_archived (
  staff_id,
  staff_name,
  staff_display_name,
  staff_roblox_name,
  staff_roblox_id,
  staff_rank,
  staff_days,
  staff_num_sesh_attend,
  hide_stats
)
VALUES
  (826091920932864020, '2deedee', 'Dee', '2DeeDee', NULLIF('783288569', '[TO BE ADDED]')::bigint, 'Assistant Authorized', 57, 0, false),
  (1125311471635681390, 'nitr0dide', 'nitro', 'nitr0dide', NULLIF('1965250260', '[TO BE ADDED]')::bigint, 'Assistant Authorized', 45, 0, false),
  (456226577798135808, 'Spectra', 'Spectra', '[DATA NOT FOUND]', NULLIF('[DATA NOT FOUND]', '[TO BE ADDED]')::bigint, 'Assistant Authorized', 61, 0, false),
  (1297243670067806258, 'mrmax_5843', 'Max', 'Itz_MaxSmh', NULLIF('1952489347', '[TO BE ADDED]')::bigint, 'Assistant Authorized', 161, 0, false),
  (720411398626082857, 'cruzil', 'Cruzill', 'Cruzill', NULLIF('1159643458', '[TO BE ADDED]')::bigint, 'Assistant Authorized', 185, 0, false),
  (799719069438836827, '.monkey2009', 'Monkey2009', 'Eli_Monkey2009', NULLIF('7996521886', '[TO BE ADDED]')::bigint, 'Assistant Authorized', 183, 0, false),
  (1219741057198325831, 'schooya', 'Shojaa', 'Shundju_6', NULLIF('3378640441', '[TO BE ADDED]')::bigint, 'Assistant Authorized', 186, 0, false),
  (1355821479081541803, 'bhaveshj27', 'Bhavesh', 'bhaveshj27', NULLIF('5427534943', '[TO BE ADDED]')::bigint, 'Co-Host Authorized', 244, 0, false),
  (959388734816653324, 'dragonmygamers2836', 'DragonGamer1963', 'DragonGamer1963', NULLIF('5011636740', '[TO BE ADDED]')::bigint, 'Head Staff', 345, 0, false),
  (945238224786321418, 'nanopro6266', 'Yarno', 'MarfelY', NULLIF('1106303768', '[TO BE ADDED]')::bigint, 'Assistant Authorized', 152, 0, false),
  (1281176981383417877, 'class801', 'el_pabl0', 'SADIQplayz786', NULLIF('4981800953', '[TO BE ADDED]')::bigint, 'Co-Host Authorized', 203, 0, false),
  (1403581511445250048, 'samyt0989_81139', 'Infernal', 'pilot_samyt7788', NULLIF('6033396574', '[TO BE ADDED]')::bigint, 'Assistant Authorized', 203, 0, false),
  (1393927926122020995, 'slippyCroc12', 'SlippyCroc12', 'SlippyCroc19', NULLIF('1276760675', '[TO BE ADDED]')::bigint, 'Assistant Authorized', 216, 0, false),
  (800062472233025566, 'jstn_123', 'Veroleone_WGF86', 'Veroleone_WGF86', NULLIF('1529464650', '[TO BE ADDED]')::bigint, 'Assistant Authorized', 81, 0, false),
  (1143112508618575883, 'rrrhys12345', 'rhys_277', 'rhys_277', NULLIF('5090526796', '[TO BE ADDED]')::bigint, 'Co-Host Authorized', 264, 0, false),
  (569459942386434049, 'anthoneh_327', 'kacc4', 'kacc4', NULLIF('389281577', '[TO BE ADDED]')::bigint, 'Head Staff', 279, 0, false),
  (1144620459267211295, 'your_average_goose', 'Sillygeece', 'Sillygeece', NULLIF('5050157800', '[TO BE ADDED]')::bigint, 'Co-Host Authorized', 429, 0, false),
  (759646190999961621, '_opboy_', 'Opboy', 'opboy1091', NULLIF('2706805642', '[TO BE ADDED]')::bigint, 'Co-Host Authorized', 307, 0, false),
  (1378997661562175518, 'timscrperson', 'Coasteride', 'Fnfrhufrhudihufrid', NULLIF('3370362687', '[TO BE ADDED]')::bigint, 'Assistant Authorized', 181, 0, false)
ON CONFLICT (staff_id) DO UPDATE SET
  staff_name = EXCLUDED.staff_name,
  staff_display_name = EXCLUDED.staff_display_name,
  staff_roblox_name = CASE
    WHEN public.staff_archived.staff_roblox_name = '[TO BE ADDED]'
      THEN EXCLUDED.staff_roblox_name
    ELSE public.staff_archived.staff_roblox_name
  END,
  staff_roblox_id = COALESCE(EXCLUDED.staff_roblox_id, public.staff_archived.staff_roblox_id),
  staff_rank = EXCLUDED.staff_rank,
  staff_days = EXCLUDED.staff_days,
  hide_stats = EXCLUDED.hide_stats;
