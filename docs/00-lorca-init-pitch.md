# Lorca - Local AI Orchastrator

Here's a braindump that I want to turn into an actionable plan.
This project's goal is to provide a web interface allowing users to build their own local AI pipeline.
I've been working on [Smartazz](~/dev/smartazz) and [Smartazz Pipeline2](~/dev/smartazz-pipeline2) and I wanted to be able to work on specific
pipeline improvements - so I was thinking of extracting the pipeline. But then I thought I'd rather build the pipeline iteratively, while checking how well
it performs on each step. Hence this tool.

This is what I'm imagening for the MVP:
- The user adds AI endpoints (like http://localhost:11434)
- Lorca queries the endpoints and gathers what models they support. The models are put into buckets of suggested usages - thinking, tiny, summarize, etc.
- The user has an input field where they can input their target query, and an output field where they can see the generated response.
- The user's prompt is wrapped in <user_prompt></user_prompt> or an equivalent tag.
- Lorca then allows the user to add to the prompt XML instructions - wrapping specific instructions with specific prompt to give context to the user's prompt.
- At any time the user can press "Execute" and send the user prompt through the pipeline, manipulating it until it reaches the user defined end result, and then sent to the model, with the response being printed in the output field.
- The user can add other model calls at any point in the pipeline, so things like adding a tiny model to extract intent, or generating acceptance criteria is possible, as well as taking data from previous steps and working with it - so the extracted acceptance criteria can be used at a later stage to verify the solution.
- The generated pipeline can be saved and reloaded in the browser (Core MVP). Export/import as JSON files and built-in example Capsules follow in MVP+.

Goals for later:
- Add MCPs, Tools, other AI support structures.
- Useful structure examples that can be added and adjusted - take examples from Smartazz projects.

Additional Nodes:
- I want the backend to be optional. I want it orchastrated via the browser  for the MVP, and adding an optional backend will come later.
- What I'm also looking for is reusability where the user can create **Capsules** (mini pipelines of preprocess → query LLM → postprocess), lock that flow down, and add it to the main pipeline wherever needed and however many times. Users should be able to perfect a Capsule so they'd want to share it. JSON export/import of pipelines and Capsules is MVP+; a sharing marketplace is later.
- For the future, I'd want an overview of the current pipeline, showing all of the componenets and how they connect to each other.
- The user should be able to loop a mini pipeline X times as part of the complete pipeline.