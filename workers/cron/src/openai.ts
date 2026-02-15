/**
 * OpenAI API Helper (Worker-compatible)
 *
 * Raw fetch wrapper for GPT-4o-mini. No SDK dependency.
 * Uses JSON response format for structured output.
 */

interface ChatCompletionOptions {
	temperature?: number;
	maxTokens?: number;
}

interface ChatCompletionResult<T> {
	parsed: T;
	inputTokens: number;
	outputTokens: number;
}

/**
 * Calls GPT-4o-mini with JSON response format and parses the result.
 */
export async function chatCompletionJSON<T>(
	apiKey: string,
	systemPrompt: string,
	userPrompt: string,
	options?: ChatCompletionOptions,
): Promise<ChatCompletionResult<T>> {
	const response = await fetch("https://api.openai.com/v1/chat/completions", {
		method: "POST",
		headers: {
			Authorization: `Bearer ${apiKey}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			model: "gpt-4o-mini",
			messages: [
				{ role: "system", content: systemPrompt },
				{ role: "user", content: userPrompt },
			],
			response_format: { type: "json_object" },
			temperature: options?.temperature ?? 0.7,
			max_tokens: options?.maxTokens ?? 2000,
		}),
	});

	if (!response.ok) {
		const errorText = await response.text();
		throw new Error(`OpenAI API error (${response.status}): ${errorText}`);
	}

	const data = (await response.json()) as {
		choices: Array<{
			message: { content: string };
		}>;
		usage: {
			prompt_tokens: number;
			completion_tokens: number;
		};
	};

	const content = data.choices[0]?.message?.content;
	if (!content) {
		throw new Error("OpenAI returned empty response");
	}

	let parsed: T;
	try {
		parsed = JSON.parse(content) as T;
	} catch {
		throw new Error(`OpenAI returned invalid JSON: ${content.slice(0, 200)}`);
	}

	return {
		parsed,
		inputTokens: data.usage.prompt_tokens,
		outputTokens: data.usage.completion_tokens,
	};
}
