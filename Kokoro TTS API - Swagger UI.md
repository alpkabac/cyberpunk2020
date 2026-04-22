### [OpenAI Compatible TTS](http://localhost:8880/docs#/OpenAI%20Compatible%20TTS)

OpenAI-compatible endpoint for text-to-speech

| Name | Description |
| --- | --- |
| 
x-raw-response

string

(header)

 |  |

```
{
  "model": "kokoro",
  "input": "string",
  "voice": "af_heart",
  "response_format": "mp3",
  "download_format": "mp3",
  "speed": 1,
  "stream": true,
  "return_download_link": false,
  "lang_code": "string",
  "volume_multiplier": 1,
  "normalization_options": {
    "normalize": true,
    "unit_normalization": false,
    "url_normalization": true,
    "email_normalization": true,
    "optional_pluralization_normalization": true,
    "phone_normalization": true,
    "replace_remaining_symbols": true
  }
}
```

| Code | Description | Links |
| --- | --- | --- |
| 200 | 
Successful Response

Media type

Controls `Accept` header.

```
"string"
```





 | _No links_ |
| 404 | 

Not found



 | _No links_ |
| 422 | 

Validation Error

Media type

```
{
  "detail": [
    {
      "loc": [
        "string",
        0
      ],
      "msg": "string",
      "type": "string"
    }
  ]
}
```





 | _No links_ |

Download a generated audio file from temp storage

| Name | Description |
| --- | --- |
| 
filename \*

string

(path)

 |  |

| Code | Description | Links |
| --- | --- | --- |
| 200 | 
Successful Response

Media type

Controls `Accept` header.

```
"string"
```





 | _No links_ |
| 404 | 

Not found



 | _No links_ |
| 422 | 

Validation Error

Media type

```
{
  "detail": [
    {
      "loc": [
        "string",
        0
      ],
      "msg": "string",
      "type": "string"
    }
  ]
}
```





 | _No links_ |

List all available voices for text-to-speech

| Code | Description | Links |
| --- | --- | --- |
| 200 | 
Successful Response

Media type

Controls `Accept` header.

```
"string"
```





 | _No links_ |
| 404 | 

Not found



 | _No links_ |

Combine multiple voices into a new voice and return the .pt file.

Args: request: Either a string with voices separated by + (e.g. "voice1+voice2") or a list of voice names to combine

Returns: FileResponse with the combined voice .pt file

Raises: HTTPException: - 400: Invalid request (wrong number of voices, voice not found) - 500: Server error (file system issues, combination failed)

| Code | Description | Links |
| --- | --- | --- |
| 200 | 
Successful Response

Media type

Controls `Accept` header.

```
"string"
```





 | _No links_ |
| 404 | 

Not found



 | _No links_ |
| 422 | 

Validation Error

Media type

```
{
  "detail": [
    {
      "loc": [
        "string",
        0
      ],
      "msg": "string",
      "type": "string"
    }
  ]
}
```





 | _No links_ |

**object**

**object**

**object**

**object**

**object**

**object**

**object**

**object**