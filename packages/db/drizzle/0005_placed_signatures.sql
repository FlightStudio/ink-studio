WITH signed AS (
	SELECT
		l.id,
		l.content ->> 'format' = 'thanksio:postcard-6x9' AS postcard,
		b.block -> 'attrs' AS attrs,
		(b.block #>> '{attrs,widthIn}')::double precision AS width,
		(b.block #>> '{attrs,widthIn}')::double precision / d.aspect AS height
	FROM letters l
	CROSS JOIN LATERAL jsonb_array_elements(l.content #> '{doc,content}') AS b(block)
	JOIN drawings d ON d.id = (b.block #>> '{attrs,drawingId}')::uuid
	WHERE b.block ->> 'type' = 'signature'
),
placed AS (
	SELECT
		id,
		jsonb_build_object(
			'id', gen_random_uuid(),
			'kind', 'signature',
			'drawingId', attrs -> 'drawingId',
			'side', CASE WHEN postcard THEN 1 ELSE 0 END,
			'xIn', CASE WHEN postcard THEN 0.375 ELSE 8.5 - 0.75 - width END,
			'yIn', CASE WHEN postcard THEN 1838.0 / 300 - 0.375 - height ELSE 11 - 0.75 - height END,
			'widthIn', width,
			'heightIn', height,
			'rotationDeg', 0,
			'tint', attrs -> 'color',
			'wrap', false
		) AS element
	FROM signed
)
UPDATE letters l
SET content = jsonb_set(
	jsonb_set(
		l.content,
		'{doc,content}',
		(
			SELECT jsonb_agg(b.block ORDER BY b.position)
			FROM jsonb_array_elements(l.content #> '{doc,content}') WITH ORDINALITY AS b(block, position)
			WHERE b.block ->> 'type' <> 'signature'
		)
	),
	'{doc,attrs,elements}',
	coalesce(l.content #> '{doc,attrs,elements}', '[]'::jsonb) || jsonb_build_array(p.element)
)
FROM placed p
WHERE p.id = l.id;
